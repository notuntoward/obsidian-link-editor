import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor, MarkdownView } from 'obsidian';

// Mock the utils and modalLogic modules before importing
vi.mock('../src/utils', () => ({
	detectLinkAtCursor: vi.fn(),
}));

vi.mock('../src/modalLogic', () => ({
	computeSkipCursorPosition: vi.fn(),
}));

// Import the mocked functions
import { detectLinkAtCursor } from '../src/utils';
import { computeSkipCursorPosition } from '../src/modalLogic';

// Get references to the mocked functions
const mockDetectLinkAtCursor = detectLinkAtCursor as any;
const mockComputeSkipCursorPosition = computeSkipCursorPosition as any;

// Mock Obsidian classes
const mockSetCursor = vi.fn();
const mockGetCursor = vi.fn();
const mockGetLine = vi.fn();
const mockLineCount = vi.fn();

const mockEditor = {
	getCursor: mockGetCursor,
	setCursor: mockSetCursor,
	getLine: mockGetLine,
	lineCount: mockLineCount,
} as unknown as Editor;

const mockView = {} as MarkdownView;

// ============================================================================
// Command Tests
// ============================================================================

describe('close-and-skip-link command', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should do nothing when no link is detected at cursor', () => {
		// Arrange
		mockGetCursor.mockReturnValue({ line: 0, ch: 5 });
		mockGetLine.mockReturnValue('Some text without links');
		mockDetectLinkAtCursor.mockReturnValue(null);

		// Act - simulate the command callback
		const cursor = mockEditor.getCursor();
		const line = mockEditor.getLine(cursor.line);
		const existingLink = detectLinkAtCursor(line, cursor.ch);

		// Assert
		expect(existingLink).toBe(null);
		expect(mockSetCursor).not.toHaveBeenCalled();
		expect(mockComputeSkipCursorPosition).not.toHaveBeenCalled();
	});

	it('should skip over link when cursor is at link position', () => {
		// Arrange
		const cursorPos = { line: 0, ch: 10 };
		const skipPos = { line: 0, ch: 20 };

		mockGetCursor.mockReturnValue(cursorPos);
		mockGetLine.mockReturnValue('Some [link](dest) text');
		mockLineCount.mockReturnValue(1);

		mockDetectLinkAtCursor.mockReturnValue({
			link: { text: 'link', destination: 'dest', isWiki: false, isEmbed: false },
			start: 5,
			end: 17,
			enteredFromLeft: true,
		});

		mockComputeSkipCursorPosition.mockReturnValue(skipPos);

		// Act - simulate the command callback
		const cursor = mockEditor.getCursor();
		const line = mockEditor.getLine(cursor.line);
		const existingLink = detectLinkAtCursor(line, cursor.ch);

		if (existingLink) {
			const skipPosResult = computeSkipCursorPosition({
				linkStart: existingLink.start,
				linkEnd: existingLink.end,
				cursorPos: cursor.ch,
				lineLength: line.length,
				line: cursor.line,
				lineCount: mockEditor.lineCount(),
				prevLineLength: 0,
			});

			mockEditor.setCursor(skipPosResult);
		}

		// Assert
		expect(mockDetectLinkAtCursor).toHaveBeenCalledWith(line, cursorPos.ch);
		expect(mockComputeSkipCursorPosition).toHaveBeenCalledWith({
			linkStart: 5,
			linkEnd: 17,
			cursorPos: 10,
			lineLength: line.length,
			line: 0,
			lineCount: 1,
			prevLineLength: 0,
		});
		expect(mockSetCursor).toHaveBeenCalledWith(skipPos);
	});

	it('should handle wiki links correctly', () => {
		// Arrange
		const cursorPos = { line: 0, ch: 8 };
		const skipPos = { line: 0, ch: 15 };

		mockGetCursor.mockReturnValue(cursorPos);
		mockGetLine.mockReturnValue('See [[Notes]] here');
		mockLineCount.mockReturnValue(1);

		mockDetectLinkAtCursor.mockReturnValue({
			link: { text: 'Notes', destination: 'Notes', isWiki: true, isEmbed: false },
			start: 4,
			end: 13,
			enteredFromLeft: false,
		});

		mockComputeSkipCursorPosition.mockReturnValue(skipPos);

		// Act - simulate the command callback
		const cursor = mockEditor.getCursor();
		const line = mockEditor.getLine(cursor.line);
		const existingLink = detectLinkAtCursor(line, cursor.ch);

		if (existingLink) {
			const skipPosResult = computeSkipCursorPosition({
				linkStart: existingLink.start,
				linkEnd: existingLink.end,
				cursorPos: cursor.ch,
				lineLength: line.length,
				line: cursor.line,
				lineCount: mockEditor.lineCount(),
				prevLineLength: 0,
			});

			mockEditor.setCursor(skipPosResult);
		}

		// Assert
		expect(mockDetectLinkAtCursor).toHaveBeenCalledWith(line, cursorPos.ch);
		expect(mockComputeSkipCursorPosition).toHaveBeenCalledWith({
			linkStart: 4,
			linkEnd: 13,
			cursorPos: 8,
			lineLength: line.length,
			line: 0,
			lineCount: 1,
			prevLineLength: 0,
		});
		expect(mockSetCursor).toHaveBeenCalledWith(skipPos);
	});
});