/* main.js */
'use strict';

var obsidian = require('obsidian');

// --- File Suggester Class ---
class FileSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl, modal) {
        super(app, textInputEl);
        this.modal = modal;
    }

    getSuggestions(query) {
        // If it looks like a URL, don't show file suggestions
        if (this.modal.isUrl(query)) {
            return [];
        }

        const files = this.app.vault.getFiles();
        const lowerQuery = query.toLowerCase();

        // Simple filter: matches filename or path
        const matches = files.filter(file => 
            file.path.toLowerCase().contains(lowerQuery) || 
            file.basename.toLowerCase().contains(lowerQuery)
        );

        // Return top 20 matches to avoid performance issues
        return matches.slice(0, 20);
    }

    renderSuggestion(file, el) {
        // Mimic Obsidian's appearance: Title (bold) + Path (small/muted)
        el.createEl("div", { text: file.basename, cls: "suggestion-title" });
        if (file.path !== file.name) {
            el.createEl("small", { text: file.path, cls: "suggestion-note" });
        }
    }

    selectSuggestion(file) {
        // When a file is selected, update the input
        const newVal = file.basename;

        this.textInputEl.value = newVal;
        this.textInputEl.trigger("input"); // Trigger update logic in modal

        this.close();
    }
}

class LinkEditModal extends obsidian.Modal {
    constructor(app, link, onSubmit, shouldSelectText, conversionNotice) {
        super(app);
        this.link = link;
        this.onSubmit = onSubmit;
        this.shouldSelectText = shouldSelectText || false;
        this.conversionNotice = conversionNotice || null;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h4", { text: "Edit Link" });

        // Determine initial link type FIRST before creating UI
        // If destination is a URL, force markdown
        if (this.isUrl(this.link.destination)) {
            this.isWiki = false;
        } else {
            // Otherwise use the provided value
            this.isWiki = this.link.isWiki;
        }

        this.wasUrl = this.isUrl(this.link.destination);

        // --- Link Text Input ---
        new obsidian.Setting(contentEl)
            .setName("Link Text")
            .addText((text) => {
                this.textInput = text;
                text.setValue(this.link.text);
                text.inputEl.style.width = "100%";
            });

        // --- Destination Input ---
        const destSetting = new obsidian.Setting(contentEl)
            .setName("Destination");

        destSetting.addText((text) => {
            this.destInput = text;
            text.setValue(this.link.destination);
            text.inputEl.style.width = "100%";

            // Attach File Suggester
            this.fileSuggest = new FileSuggest(this.app, text.inputEl, this);

            // Event Listener for "Input"
            text.inputEl.addEventListener("input", () => {
                this.handleDestInput();
            });
        });

        // --- Conversion Notice (if URL was converted) ---
        if (this.conversionNotice) {
            this.noticeEl = contentEl.createDiv({ 
                cls: "link-conversion-notice"
            });
            this.noticeEl.createEl("small", { 
                text: this.conversionNotice,
                cls: "link-conversion-text"
            });
        }

        // --- Link Type Toggle ---
        // Now create toggle with the correctly determined isWiki value
        this.typeSetting = new obsidian.Setting(contentEl)
            .setName("Link Type")
            .setDesc(this.isWiki ? "Wiki Link" : "Markdown Link")
            .addToggle((toggle) => {
                this.toggleComponent = toggle;
                toggle
                    .setValue(this.isWiki)
                    .onChange((value) => {
                        this.isWiki = value;
                        this.updateUIState();
                    });
            });

        // --- Buttons ---
        new obsidian.Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText("Apply")
                .setCta()
                .onClick(() => this.submit())
            );

        // --- Key Handling ---
        this.modalEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.submit();
            } else if (e.key === "Escape") {
                this.close();
            }
        });

        this.updateUIState();

        // --- Focus Logic ---
        if (this.shouldSelectText && this.link.text && this.link.text.length > 0) {
            // Focus text box and select all
            this.textInput.inputEl.focus();
            this.textInput.inputEl.select();
        } else if (this.link.text && this.link.text.length > 0) {
            // Normal behavior: focus destination if text is populated
            this.destInput.inputEl.focus();
            if (this.link.destination && this.link.destination.length > 0) {
                this.destInput.inputEl.select();
            }
        } else {
            // Default: focus text box
            this.textInput.inputEl.focus();
        }
    }

    isUrl(str) {
        if (!str) return false;
        const trimmed = str.trim();

        // Only match URLs that Obsidian actually auto-links (GFM autolink extension):
        // 1. http:// or https://
        // 2. www.
        // Note: Bare domains like "example.com" are NOT auto-linked by Obsidian
        return /^https?:\/\/\S+$|^www\.\S+$/i.test(trimmed);
    }

    handleDestInput() {
        const val = this.destInput.getValue();
        const isNowUrl = this.isUrl(val);

        // If the destination is a valid URL, switch to Markdown
        if (isNowUrl) {
            this.isWiki = false;
            this.toggleComponent.setValue(false);
        }

        this.wasUrl = isNowUrl;
        this.updateUIState();
    }

    updateUIState() {
        // Update Description Label
        this.typeSetting.setDesc(this.isWiki ? "Wiki Link" : "Markdown Link");
    }

    submit() {
        this.onSubmit({
            text: this.textInput.getValue(),
            destination: this.destInput.getValue(),
            isWiki: this.isWiki,
        });
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

const DEFAULT_SETTINGS = {
    alwaysMoveToEnd: false,
};

class LinkEditorPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: "edit-link",
            name: "Edit link",
            editorCallback: async (editor, view) => {
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);

                const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                const wikiRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

                let match;
                let link = null;
                let start = 0;
                let end = 0;
                let enteredFromLeft = true;

                // 1. Check Markdown
                while ((match = mdRegex.exec(line)) !== null) {
                    start = match.index;
                    end = match.index + match[0].length;
                    if (cursor.ch >= start && cursor.ch <= end) {
                        link = { text: match[1], destination: match[2], isWiki: false };
                        enteredFromLeft = cursor.ch <= start + 1;
                        break;
                    }
                }

                // 2. Check Wiki
                if (!link) {
                    while ((match = wikiRegex.exec(line)) !== null) {
                        start = match.index;
                        end = match.index + match[0].length;
                        if (cursor.ch >= start && cursor.ch <= end) {
                            link = { destination: match[1], text: match[2] ?? match[1], isWiki: true };
                            enteredFromLeft = cursor.ch <= start + 2;
                            break;
                        }
                    }
                }

                // 3. New Link
                let shouldSelectText = false;
                let conversionNotice = null;

                if (!link) {
                    const selection = editor.getSelection();
                    let clipboardText = "";
                    try { 
                        clipboardText = await navigator.clipboard.readText();
                        clipboardText = clipboardText.trim();
                    } catch (e) {}

                    // Helper function to check if string is URL-like
                    // Only URLs that Obsidian actually auto-links (GFM spec)
                    const isUrl = (str) => {
                        if (!str) return false;
                        const trimmed = str.trim();
                        return /^https?:\/\/\S+$|^www\.\S+$/i.test(trimmed);
                    };

                    // Helper to normalize URL for markdown links (add https:// if needed)
                    const normalizeUrl = (str) => {
                        if (!str) return str;
                        const trimmed = str.trim();

                        // Already has protocol
                        if (/^https?:\/\//i.test(trimmed)) {
                            return trimmed;
                        }

                        // Starts with www. - add https://
                        if (/^www\./i.test(trimmed)) {
                            return 'https://' + trimmed;
                        }

                        return trimmed;
                    };

                    // Check if selection or clipboard is a URL
                    const isSelectionUrl = isUrl(selection);
                    const isClipboardUrl = isUrl(clipboardText);

                    // Determine text and destination placement
                    let linkText = "";
                    let linkDest = "";
                    let shouldBeMarkdown = false;

                    if (isSelectionUrl) {
                        // Selection is a URL
                        const original = selection.trim();
                        const normalized = normalizeUrl(original);

                        // FIXED: Original URL goes to text (selected), normalized goes to destination
                        linkText = original;
                        linkDest = normalized;
                        shouldBeMarkdown = true;
                        shouldSelectText = true; // Select the text so user can replace it

                        if (original !== normalized) {
                            conversionNotice = `URL converted: ${original} → ${normalized}`;
                        }
                    } else if (selection) {
                        // Selection is text, check clipboard for URL
                        linkText = selection;

                        if (isClipboardUrl) {
                            const original = clipboardText;
                            const normalized = normalizeUrl(original);
                            linkDest = normalized;
                            shouldBeMarkdown = true;

                            if (original !== normalized) {
                                conversionNotice = `URL converted: ${original} → ${normalized}`;
                            }
                        } else {
                            linkDest = clipboardText;
                            shouldBeMarkdown = false;
                        }
                    } else if (isClipboardUrl) {
                        // No selection, clipboard has URL
                        const original = clipboardText;
                        const normalized = normalizeUrl(original);

                        linkText = normalized;
                        linkDest = normalized;
                        shouldSelectText = true;
                        shouldBeMarkdown = true;

                        if (original !== normalized) {
                            conversionNotice = `URL converted: ${original} → ${normalized}`;
                        }
                    } else {
                        // No selection, no URL
                        linkText = "";
                        linkDest = clipboardText;
                        shouldBeMarkdown = false;
                    }

                    link = {
                        text: linkText,
                        destination: linkDest,
                        isWiki: !shouldBeMarkdown
                    };

                    if (editor.somethingSelected()) {
                        const selStart = editor.getCursor("from");
                        const selEnd = editor.getCursor("to");
                        start = selStart.ch;
                        end = selEnd.ch;
                    } else {
                        start = cursor.ch;
                        end = cursor.ch;
                    }
                }

                new LinkEditModal(this.app, link, (result) => {
                    let replacement;
                    if (result.isWiki) {
                        if (result.text === result.destination) {
                            replacement = `[[${result.destination}]]`;
                        } else {
                            replacement = `[[${result.destination}|${result.text}]]`;
                        }
                    } else {
                        replacement = `[${result.text}](${result.destination})`;
                    }

                    editor.replaceRange(replacement, { line: cursor.line, ch: start }, { line: cursor.line, ch: end });

                    let newCh;
                    if (this.settings.alwaysMoveToEnd) {
                        newCh = start + replacement.length;
                    } else {
                        newCh = enteredFromLeft ? start + replacement.length : start;
                    }
                    editor.setCursor({ line: cursor.line, ch: newCh });
                }, shouldSelectText, conversionNotice).open();
            },
        });

        this.addSettingTab(new LinkEditorSettingTab(this.app, this));
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class LinkEditorSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Link Editor Settings" });

        new obsidian.Setting(containerEl)
            .setName("Always move cursor to end of link")
            .setDesc("If enabled, the cursor will always move after the link after editing.")
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.alwaysMoveToEnd)
                .onChange(async (value) => {
                    this.plugin.settings.alwaysMoveToEnd = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = LinkEditorPlugin;
