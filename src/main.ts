import { Plugin, Editor, MarkdownView } from "obsidian";
import { Extension } from "@codemirror/state";
import { EditLinkModal } from "./EditLinkModal";
import { SteadyLinksSettingTab } from "./SettingTab";
import { PluginSettings, LinkInfo } from "./types";
import {
	parseClipboardLink,
	detectLinkAtCursor,
	determineLinkFromContext,
	urlAtCursor
} from "./utils";
import { buildLinkText, computeCloseCursorPosition, computeSkipCursorPosition } from "./modalLogic";
import { createLinkSyntaxHiderExtension, findLinkRangeAtPos, setTemporarilyVisibleLink } from "./linkSyntaxHider";
import { EditorView } from "@codemirror/view";

const DEFAULT_SETTINGS: PluginSettings = {
	alwaysMoveToEnd: false,
	keepLinksSteady: false,
};

export default class SteadyLinksPlugin extends Plugin {
	settings!: PluginSettings;

	/**
	 * Live array registered with `registerEditorExtension`.
	 * Mutating its contents and calling `app.workspace.updateOptions()`
	 * toggles the link-syntax-hider extension at runtime.
	 */
	private syntaxHiderExtensions: Extension[] = [];

	async onload() {
		await this.loadSettings();

		// Register the (initially empty) extension array.  We populate it
		// later based on the user's setting.
		this.registerEditorExtension(this.syntaxHiderExtensions);
		this.applySyntaxHiderSetting();

		this.addCommand({
			id: "edit-link",
			name: "Edit link",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				// Try to detect existing link at cursor
				const existingLink = detectLinkAtCursor(line, cursor.ch);

				let link: LinkInfo | null = null;
				let start = cursor.ch;
				let end = cursor.ch;
				let enteredFromLeft = true;

				if (existingLink) {
					// Found existing link
					link = existingLink.link;
					start = existingLink.start;
					end = existingLink.end;
					enteredFromLeft = existingLink.enteredFromLeft;
				} else {
					// Creating new link
					const selection = editor.getSelection();
					let clipboardText = "";

					try {
						clipboardText = await navigator.clipboard.readText();
						clipboardText = clipboardText.trim();
					} catch (e) {
						// Clipboard access may fail
					}

					const cursorUrl = urlAtCursor(line, cursor.ch);

					// Determine link from context (selection, clipboard, URL at cursor)
					const linkContext = determineLinkFromContext({
						selection,
						clipboardText,
						cursorUrl,
						line,
						cursorCh: cursor.ch
					});

					link = {
						text: linkContext.text,
						destination: linkContext.destination,
						isWiki: linkContext.isWiki,
						isEmbed: false,
					};

					// Handle selection range or URL range
					if (editor.somethingSelected()) {
						const selStart = editor.getCursor("from");
						const selEnd = editor.getCursor("to");
						start = selStart.ch;
						end = selEnd.ch;
					} else if (cursorUrl) {
						start = linkContext.start;
						end = linkContext.end;
					} else {
						start = cursor.ch;
						end = cursor.ch;
					}

					// Open modal with link information
					const isEditingExistingLink = false;
					const shouldSelectText = linkContext.shouldSelectText;
					const conversionNotice = linkContext.conversionNotice;

					new EditLinkModal(
							this.app,
							link,
							(result: LinkInfo) => {
								const cursorPos = this.applyLinkEdit(editor, cursor.line, start, end, result, enteredFromLeft);
								// Re-assert cursor after modal closes so the link collapses in live preview
								setTimeout(() => editor.setCursor(cursorPos), 0);
							},
						shouldSelectText,
						conversionNotice,
						!isEditingExistingLink
					).open();

					return;
				}

				// At this point, link is guaranteed to be non-null
				// Open modal for editing
				new EditLinkModal(
					this.app,
					link!,
					(result: LinkInfo) => {
						const cursorPos = this.applyLinkEdit(editor, cursor.line, start, end, result, enteredFromLeft);
						// Re-assert cursor after modal closes so the link collapses in live preview
						setTimeout(() => editor.setCursor(cursorPos), 0);
					},
					false, // shouldSelectText
					null,  // conversionNotice
					false  // isNewLink
				).open();
			},
		});

		this.addCommand({
			id: "hide-link-syntax",
			name: "Hide Link Syntax",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				const existingLink = detectLinkAtCursor(line, cursor.ch);

				if (!existingLink) {
					return;
				}

				// Clear any temporarily visible link
				const cm6View = (editor as any).cm as EditorView;
				if (cm6View) {
					cm6View.dispatch({
						effects: setTemporarilyVisibleLink.of(null)
					});
				}

				const skipPos = computeSkipCursorPosition({
					linkStart: existingLink.start,
					linkEnd: existingLink.end,
					cursorPos: cursor.ch,
					lineLength: line.length,
					line: cursor.line,
					lineCount: editor.lineCount(),
					prevLineLength: cursor.line > 0 ? editor.getLine(cursor.line - 1).length : 0,
				});

				editor.setCursor(skipPos);
			},
		});

		this.addCommand({
			id: "show-link-syntax",
			name: "Show Link Syntax",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// Get the CM6 view from the editor
				const cm6View = (editor as any).cm as EditorView;
				if (!cm6View) {
					return;
				}

				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				// First, try to detect link at current cursor position using the editor API
				let existingLink = detectLinkAtCursor(line, cursor.ch);

				// If not found at cursor, try to find any link on the current line
				// by iterating through potential positions (cursor might be pushed out)
				if (!existingLink) {
					// Try positions around the cursor
					for (let offset = -5; offset <= 5; offset++) {
						const testPos = cursor.ch + offset;
						if (testPos >= 0 && testPos <= line.length) {
							existingLink = detectLinkAtCursor(line, testPos);
							if (existingLink) {
								break;
							}
						}
					}
				}

				if (!existingLink) {
					return;
				}

				// Find the full link range (including syntax) using CM6 document positions
				const docLine = cm6View.state.doc.line(cursor.line + 1); // CM6 lines are 1-indexed
				
				// Convert the editor line position to CM6 document position
				const linkStartPos = docLine.from + existingLink.start;
				const linkEndPos = docLine.from + existingLink.end;
				
				// Try to find the link range at the link's actual position
				const linkRange = findLinkRangeAtPos(docLine.text, docLine.from, linkStartPos);

				if (!linkRange) {
					return;
				}

				// Dispatch effect to temporarily show this link's syntax
				cm6View.dispatch({
					effects: setTemporarilyVisibleLink.of(linkRange)
				});
			},
		});

		this.addSettingTab(new SteadyLinksSettingTab(this.app, this));
	}

	/**
	 * Apply link edit to editor
	 */
	private applyLinkEdit(
		editor: Editor,
		line: number,
		start: number,
		end: number,
		result: LinkInfo,
		enteredFromLeft: boolean
	): { line: number; ch: number } {
		const replacement = buildLinkText(result);

		editor.replaceRange(
			replacement,
			{ line: line, ch: start },
			{ line: line, ch: end }
		);

		const cursorPos = computeCloseCursorPosition({
			linkStart: start,
			linkEnd: start + replacement.length,
			lineLength: editor.getLine(line).length,
			line,
			preferRight: this.settings.alwaysMoveToEnd || !enteredFromLeft,
			lineCount: editor.lineCount(),
			prevLineLength: line > 0 ? editor.getLine(line - 1).length : 0,
		});

		editor.setCursor(cursorPos);
		return cursorPos;
	}

	/**
	 * Populate or clear the live extensions array so the CM6 link-syntax
	 * hider is active only when the user has opted in.
	 */
	applySyntaxHiderSetting() {
		this.syntaxHiderExtensions.length = 0;
		if (this.settings.keepLinksSteady) {
			this.syntaxHiderExtensions.push(
				...createLinkSyntaxHiderExtension(),
			);
		}
		this.app.workspace.updateOptions();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
