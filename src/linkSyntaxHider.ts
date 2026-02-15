/**
 * CM6 extension that prevents links from visually expanding when the cursor
 * enters them.
 *
 * Strategy:
 *   - A **ViewPlugin** replaces hidden syntax ranges with zero-width widgets
 *     so the syntax is not rendered as text nodes (prevents zero-metric
 *     cursor positions).
 *   - An **updateListener** corrects the cursor position synchronously when
 *     it lands inside a hidden region, giving one-keypress skip.
 *   - A **transactionFilter** protects hidden ranges from user-initiated
 *     edits while allowing programmatic changes (Edit Link command).
 */

import {
	EditorView,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	PluginValue,
	WidgetType,
} from "@codemirror/view";
import {
	RangeSetBuilder,
	EditorState,
	EditorSelection,
	StateField,
} from "@codemirror/state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HiddenRange {
	from: number;
	to: number;
	side: "leading" | "trailing";
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

class HiddenSyntaxWidget extends WidgetType {
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "le-hidden-syntax-anchor";
		return span;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

const hiddenSyntaxReplace = Decoration.replace({
	widget: new HiddenSyntaxWidget(),
});

// ---------------------------------------------------------------------------
// Link detection (raw line text)
// ---------------------------------------------------------------------------

function findMarkdownLinkSyntaxRanges(
	lineText: string,
	lineFrom: number,
): HiddenRange[] {
	const ranges: HiddenRange[] = [];
	const re = /(!?\[)([^\]]*)\]\(([^)]+)\)/g;
	let m: RegExpExecArray | null;

	while ((m = re.exec(lineText)) !== null) {
		const fullStart = lineFrom + m.index;
		const prefixLen = m[1].length;
		const textLen = m[2].length;
		const textStart = fullStart + prefixLen;
		const textEnd = textStart + textLen;
		const fullEnd = fullStart + m[0].length;

		if (fullStart < textStart)
			ranges.push({ from: fullStart, to: textStart, side: "leading" });
		if (textEnd < fullEnd)
			ranges.push({ from: textEnd, to: fullEnd, side: "trailing" });
	}
	return ranges;
}

function findWikiLinkSyntaxRanges(
	lineText: string,
	lineFrom: number,
): HiddenRange[] {
	const ranges: HiddenRange[] = [];
	let searchIdx = 0;

	while (searchIdx < lineText.length) {
		const openIdx = lineText.indexOf("[[", searchIdx);
		if (openIdx === -1) break;
		const closeIdx = lineText.indexOf("]]", openIdx + 2);
		if (closeIdx === -1) break;

		const hasEmbed = openIdx > 0 && lineText[openIdx - 1] === "!";
		const rangeStart = lineFrom + (hasEmbed ? openIdx - 1 : openIdx);
		const innerStart = openIdx + 2;
		const innerContent = lineText.substring(innerStart, closeIdx);
		const pipeIdx = innerContent.lastIndexOf("|");
		const fullEnd = lineFrom + closeIdx + 2;

		if (pipeIdx !== -1) {
			const textStart = lineFrom + innerStart + pipeIdx + 1;
			const textEnd = lineFrom + closeIdx;
			ranges.push({ from: rangeStart, to: textStart, side: "leading" });
			ranges.push({ from: textEnd, to: fullEnd, side: "trailing" });
		} else {
			const textStart = lineFrom + innerStart;
			const textEnd = lineFrom + closeIdx;
			ranges.push({ from: rangeStart, to: textStart, side: "leading" });
			ranges.push({ from: textEnd, to: fullEnd, side: "trailing" });
		}
		searchIdx = closeIdx + 2;
	}
	return ranges;
}

function computeHiddenRanges(state: EditorState): HiddenRange[] {
	const ranges: HiddenRange[] = [];
	const seenLines = new Set<number>();

	for (const sel of state.selection.ranges) {
		seenLines.add(state.doc.lineAt(sel.head).number);
		seenLines.add(state.doc.lineAt(sel.anchor).number);
	}

	for (const lineNo of seenLines) {
		const line = state.doc.line(lineNo);
		ranges.push(
			...findMarkdownLinkSyntaxRanges(line.text, line.from),
			...findWikiLinkSyntaxRanges(line.text, line.from),
		);
	}

	ranges.sort((a, b) => a.from - b.from || a.to - b.to);
	return ranges;
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

const hiddenRangesField = StateField.define<HiddenRange[]>({
	create(state) {
		return computeHiddenRanges(state);
	},
	update(prev, tr) {
		if (tr.docChanged || tr.selection) {
			return computeHiddenRanges(tr.state);
		}
		return prev;
	},
});

// ---------------------------------------------------------------------------
// Body class manager
// ---------------------------------------------------------------------------

const BODY_CLASS = "le-prevent-link-expansion";

class BodyClassPlugin implements PluginValue {
	constructor(_view: EditorView) {
		document.body.classList.add(BODY_CLASS);
	}
	update(_update: ViewUpdate) {}
	destroy() {
		document.body.classList.remove(BODY_CLASS);
	}
}

const bodyClassPlugin = ViewPlugin.fromClass(BodyClassPlugin);

// ---------------------------------------------------------------------------
// ViewPlugin - replace hidden syntax ranges
// ---------------------------------------------------------------------------

class HiddenSyntaxReplacePlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.build(view.state);
	}

	update(update: ViewUpdate) {
		if (
			update.docChanged ||
			update.selectionSet ||
			update.viewportChanged
		) {
			this.decorations = this.build(update.state);
		}
	}

	private build(state: EditorState): DecorationSet {
		const ranges = computeHiddenRanges(state);
		if (ranges.length === 0) return Decoration.none;

		const builder = new RangeSetBuilder<Decoration>();
		for (const r of ranges) {
			if (r.from < r.to) builder.add(r.from, r.to, hiddenSyntaxReplace);
		}
		return builder.finish();
	}

	destroy() {}
}

const hiddenSyntaxReplacePlugin = ViewPlugin.fromClass(
	HiddenSyntaxReplacePlugin,
	{
	decorations: (v) => v.decorations,
	},
);

// ---------------------------------------------------------------------------
// Cursor correction
// ---------------------------------------------------------------------------

function correctCursorPos(
	pos: number,
	oldPos: number,
	hidden: HiddenRange[],
	docLength: number,
): number | null {
	for (const h of hidden) {
		let inside: boolean;
		if (h.side === "leading") {
			inside = pos >= h.from && pos < h.to;
		} else {
			inside = pos > h.from && pos <= h.to;
		}
		if (!inside) continue;

		const movingRight = pos >= oldPos;
		if (h.side === "leading") {
			return movingRight ? h.to : Math.max(0, h.from - 1);
		}
		return movingRight
			? Math.min(docLength, h.to + 1)
			: h.from;
	}
	return null;
}

function computeHiddenRangesForPositions(
	doc: {
		lineAt(pos: number): { number: number; from: number; text: string };
		line(n: number): { from: number; text: string };
	},
	sel: EditorSelection,
): HiddenRange[] {
	const ranges: HiddenRange[] = [];
	const seenLines = new Set<number>();
	for (const r of sel.ranges) {
		seenLines.add(doc.lineAt(r.head).number);
	}
	for (const lineNo of seenLines) {
		const line = doc.line(lineNo);
		ranges.push(
			...findMarkdownLinkSyntaxRanges(line.text, line.from),
			...findWikiLinkSyntaxRanges(line.text, line.from),
		);
	}
	ranges.sort((a, b) => a.from - b.from || a.to - b.to);
	return ranges;
}

const CORRECTING = "__leSyntaxCorrecting";

const cursorCorrector = EditorView.updateListener.of((update) => {
	if (!update.selectionSet) return;
	if ((update.view as any)[CORRECTING]) return;

	const state = update.state;
	const newSel = state.selection;
	const oldSel = update.startState.selection;

	const hidden = computeHiddenRangesForPositions(state.doc, newSel);
	if (hidden.length === 0) return;

	const docLen = state.doc.length;
	let needsAdjust = false;

	const adjusted = newSel.ranges.map((range, i) => {
		const oldHead =
			i < oldSel.ranges.length
				? oldSel.ranges[i].head
				: oldSel.main.head;
		let head = range.head;

		for (let pass = 0; pass < 3; pass++) {
			const corrected = correctCursorPos(head, oldHead, hidden, docLen);
			if (corrected === null) break;
			head = corrected;
			needsAdjust = true;
		}

		return range.empty
			? EditorSelection.cursor(head)
			: EditorSelection.range(range.anchor, head);
	});

	if (!needsAdjust) return;

	const sel = EditorSelection.create(adjusted, newSel.mainIndex);
	const view = update.view;

	(view as any)[CORRECTING] = true;
	try {
		view.dispatch({ selection: sel, scrollIntoView: true });
	} finally {
		(view as any)[CORRECTING] = false;
	}
});



// ---------------------------------------------------------------------------
// Edit protection
// ---------------------------------------------------------------------------

const protectSyntaxFilter = EditorState.transactionFilter.of((tr) => {
	if (!tr.docChanged) return tr;
	if (!tr.isUserEvent("input") && !tr.isUserEvent("delete")) return tr;

	const hidden = tr.startState.field(hiddenRangesField, false);
	if (!hidden || hidden.length === 0) return tr;

	let dominated = false;
	tr.changes.iterChangedRanges((fromA: number, toA: number) => {
		for (const h of hidden) {
			if (fromA < h.to && toA > h.from) dominated = true;
		}
	});
	return dominated ? [] : tr;
});


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createLinkSyntaxHiderExtension() {
	return [
		hiddenRangesField,
		bodyClassPlugin,
		hiddenSyntaxReplacePlugin,
		cursorCorrector,
		protectSyntaxFilter,
	];
}

export {
	findMarkdownLinkSyntaxRanges,
	findWikiLinkSyntaxRanges,
	computeHiddenRanges,
};
export type { HiddenRange };
