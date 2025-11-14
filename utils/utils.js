import { getCurrentChatId } from "../../../../../script.js";

export function formatTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}${second}`;
}

// Replaces all invalid characters (including spaces) with underscores
export function normalizeString(str, defaultValue = '') {
    if (!str && str !== 0) {
        return defaultValue;
    }
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function normalizeChatId(chatId) {
    return normalizeString(chatId, 'unknown');
}

export function getNormalizedChatId() {
    return normalizeChatId(getCurrentChatId());
}

export function normalizeCharacterName(characterName) {
    return normalizeString(characterName, '');
}

export function formatTimestampToDate(timestamp) {
    const date = new Date(
        parseInt(timestamp.substring(0, 4)),
        parseInt(timestamp.substring(4, 6)) - 1,
        parseInt(timestamp.substring(6, 8)),
        parseInt(timestamp.substring(8, 10)),
        parseInt(timestamp.substring(10, 12)),
        parseInt(timestamp.substring(12, 14))
    );
    const dateStr = date.toLocaleDateString('ru-RU', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    });
    const timeStr = date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    return `${dateStr} ${timeStr}`;
}

export function parseFilesList(files, parseSaveFilename) {
    return files.map(file => {
        const filename = file.name || file;
        const parsed = parseSaveFilename(filename);
        return { ...(typeof file === 'object' ? file : {}), name: filename, parsed };
    });
}

// Supports both formats: parsed.timestamp (for files) and timestamp (for objects)
export function sortByTimestamp(items, descending = true) {
    return items.sort((a, b) => {
        const timestampA = a.parsed?.timestamp || a.timestamp;
        const timestampB = b.parsed?.timestamp || b.timestamp;
        
        if (!timestampA || !timestampB) return 0;
        
        if (descending) {
            return timestampB.localeCompare(timestampA);
        } else {
            return timestampA.localeCompare(timestampB);
        }
    });
}

