# Link Editor

A single Keyboard-friendly command does either link creation or editing, entirely without a mouse. The mouse works too, of course, but you still benefit from the convenient link editing popup, which avoids editing the messy markdown of Obsidian's auto-expanded links.

## Usage

*Assuming you've mapped  `Edit link` to a hotkey ([Setup](setup)), then…*

**Edit existing link**: Place cursor in any link, press hotkey. Modify and press Enter.

**Create new link**: push hotkey, fill out the popup form and hit return or click `Accept`.  If your clipboard contains a URL, it goes to the link destination; if it contains non-URL text, it goes to the link text.

**Create from selection**: Select text, run `Edit Link`. Text becomes link text if it's not a URL, otherwise, it becomes the the link destination. If the selection is text, and if you have a URL in your clipboard, that becomes the link destination.

**Create from URL**: Copy URL, press hotkey. If you have no selection, then URL fills both fields (link text is highlighted for replacement).  

**URL auto-conversion**: `www.example.com` → `https://www.example.com`

## Features

- Toggle between Wiki links (`[[note]]`) and Markdown links (`[text](url)`)
- Auto-switches to Markdown when URL detected
- Note name completion interface for internal links 
- Shows conversion notices when URLs are normalized

## Settings

**Always move cursor to end**: When disabled, cursor returns to original position after editing

## Setup

1. Install the plugin
2. Go to Settings → Hotkeys
3. Search for "Edit link"
4. Assign a hotkey (e.g., `Ctrl+K`)

## License

MIT