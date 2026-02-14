import { App, PluginSettingTab, Setting } from "obsidian";
import type LinkEditorPlugin from "./main";

export class LinkEditorSettingTab extends PluginSettingTab {
	plugin: LinkEditorPlugin;

	constructor(app: App, plugin: LinkEditorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Link Editor Settings" });

		new Setting(containerEl)
			.setName("Always move cursor to end of link")
			.setDesc("If enabled, the cursor will always move after the link after editing.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.alwaysMoveToEnd).onChange(async (value) => {
					this.plugin.settings.alwaysMoveToEnd = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Prevent link expansion on cursor movement")
			.setDesc(
				"When enabled, moving the cursor into a link will not reveal its " +
				"raw markdown syntax. The display text stays editable as normal " +
				"text; use the Edit Link command to change the destination."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.preventLinkExpansion)
					.onChange(async (value) => {
						this.plugin.settings.preventLinkExpansion = value;
						await this.plugin.saveSettings();
						this.plugin.applySyntaxHiderSetting();
					})
			);
	}
}
