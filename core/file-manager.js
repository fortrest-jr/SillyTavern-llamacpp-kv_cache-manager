import FilePluginApi from '../api/file-plugin-api.js';
import { normalizeChatId, normalizeCharacterName, normalizeString, getNormalizedChatId, parseFilesList, sortByTimestamp } from '../utils/utils.js';
import { showToast } from '../ui/ui.js';
import { getExtensionSettings, MIN_FILE_SIZE_MB, FILE_CHECK_DELAY_MS } from '../settings.js';

const filePluginApi = new FilePluginApi();

/**
 * Generate filename in unified format
 * Formats:
 * - Auto-save: {chatId}_{timestamp}_character_{characterName}.bin
 * - With tag: {chatId}_{timestamp}_tag_{tag}_character_{characterName}.bin
 * @param {string} chatId - Chat ID
 * @param {string} timestamp - Timestamp
 * @param {string} characterName - Character name (required)
 * @param {string} tag - Tag for manual save (optional)
 * @returns {string} Filename
 */
export function generateSaveFilename(chatId, timestamp, characterName, tag = null) {
    const safeChatId = normalizeChatId(chatId);
    const safeCharacterName = characterName;
    
    if (tag) {
        const safeTag = normalizeString(tag);
        return `${safeChatId}_${timestamp}_tag_${safeTag}_character_${safeCharacterName}.bin`;
    }
    
    return `${safeChatId}_${timestamp}_character_${safeCharacterName}.bin`;
}

/**
 * Parse filename to extract data
 * Supports formats:
 * - Auto-save: {chatId}_{timestamp}_character_{characterName}.bin
 * - With tag: {chatId}_{timestamp}_tag_{tag}_character_{characterName}.bin
 * Also supports old format for backward compatibility:
 * - {chatId}_{timestamp}_tag_{tag}_slot{slotId}.bin
 * - {chatId}_{timestamp}_slot{slotId}.bin
 * @param {string} filename - Filename to parse
 * @returns {Object|null} { chatId, timestamp, tag, slotId, characterName } or null on error
 */
export function parseSaveFilename(filename) {
    const nameWithoutExt = filename.replace(/\.bin$/, '');
    
    let tag = null;
    let characterName = null;
    let beforeSuffix = nameWithoutExt;
    
    // Check new format: _character_{characterName} (always at the end)
    const characterMatch = nameWithoutExt.match(/_character_(.+)$/);
    if (!characterMatch) {
        return null;
    }
    characterName = characterMatch[1];
    beforeSuffix = nameWithoutExt.slice(0, -characterMatch[0].length);
    
    const tagMatch = beforeSuffix.match(/_tag_(.+)$/);
    if (tagMatch) {
        tag = tagMatch[1];
        beforeSuffix = beforeSuffix.slice(0, -tagMatch[0].length);
    }
    
    // Find timestamp (14 digits) from the end
    const timestampMatch = beforeSuffix.match(/_(\d{14})$/);
    if (!timestampMatch) {
        return null;
    }
    
    const timestamp = timestampMatch[1];
    const chatId = beforeSuffix.slice(0, -timestampMatch[0].length);
    
    return {
        chatId: chatId,
        timestamp: timestamp,
        tag: tag,
        characterName: characterName
    };
}

export async function getFilesList() {
    try {
        const data = await filePluginApi.getFilesList();
        
        if (data) {
            const binFiles = (data.files || []).filter(file => 
                file.name.endsWith('.bin') && !file.isDirectory
            );
            return binFiles.map(file => ({
                name: file.name,
                size: file.size || 0
            }));
        }
        
        return [];
    } catch (e) {
        console.error('[KV Cache Manager] Error getting file list:', e);
        showToast('error', 'Error getting file list: ' + e.message);
        return [];
    }
}

export async function deleteFile(filename) {
    try {
        await filePluginApi.deleteFile(filename);
        return true;
    } catch (e) {
        console.warn(`[KV Cache Manager] Error deleting file ${filename}:`, e);
        return false;
    }
}

/**
 * General file rotation function
 * @param {Function} filterFn - File filtering function: (file) => boolean
 * @param {string} description - Description for logs and notifications (e.g., "for character CharacterName" or "for chat")
 * @param {string} context - Context for logs (e.g., "character CharacterName" or "chat")
 * @returns {Promise<void>}
 */
export async function rotateFiles(filterFn, description, context) {
    const extensionSettings = getExtensionSettings();
    const maxFiles = extensionSettings.maxFiles || 10;
    const chatId = getNormalizedChatId();
    
    try {
        const filesList = await getFilesList();
        
        const filteredFiles = parseFilesList(filesList, parseSaveFilename).filter(filterFn);
        
        sortByTimestamp(filteredFiles);
        
        if (filteredFiles.length > maxFiles) {
            const filesToDelete = filteredFiles.slice(maxFiles);
            
            let deletedCount = 0;
            for (const file of filesToDelete) {
                const deleted = await deleteFile(file.name);
                if (deleted) {
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0 && extensionSettings.showNotifications) {
                showToast('warning', `Удалено ${deletedCount} старых автосохранений ${description}`, 'Ротация файлов');
            }
        }
    } catch (e) {
        console.error(`[KV Cache Manager] Error rotating files ${context}:`, e);
    }
}

/**
 * Rotate files for specific character
 * @param {string} characterName - Character name (will be normalized)
 * @returns {Promise<void>}
 */
export async function rotateCharacterFiles(characterName) {
    if (!characterName) {
        return;
    }
    
    // characterName should already be normalized, but normalize for safety
    const normalizedName = normalizeCharacterName(characterName);
    const chatId = getNormalizedChatId();
    
    await rotateFiles(
        (file) => {
            if (!file.parsed) return false;
            const parsedNormalizedName = normalizeCharacterName(file.parsed.characterName || '');
            return file.parsed.chatId === chatId && 
                   parsedNormalizedName === normalizedName &&
                   !file.parsed.tag; // Only auto-saves (without tag)
        },
        `для персонажа ${characterName} в чате ${chatId}`,
        `для ${characterName}`
    );
}

export function groupFilesByChatAndCharacter(files) {
    const chats = {};
    
    const parsedFiles = parseFilesList(files, parseSaveFilename);
    
    for (const file of parsedFiles) {
        if (!file.parsed) {
            continue;
        }
        
        const chatId = file.parsed.chatId;
        const characterName = file.parsed.characterName || 'Unknown';
        
        if (!chats[chatId]) {
            chats[chatId] = {};
        }
        
        if (!chats[chatId][characterName]) {
            chats[chatId][characterName] = [];
        }
        
        chats[chatId][characterName].push({
            timestamp: file.parsed.timestamp,
            filename: file.name,
            tag: file.parsed.tag || null
        });
    }
    
    for (const chatId in chats) {
        for (const characterName in chats[chatId]) {
            sortByTimestamp(chats[chatId][characterName]);
        }
    }
    
    return chats;
}

/**
 * Get last cache for character
 * @param {string} characterName - Normalized character name
 * @param {boolean} currentChatOnly - Search only in current chat (default: true)
 * @returns {Promise<Object|null>} Cache info or null
 */
export async function getLastCacheForCharacter(characterName, currentChatOnly = true) {
    try {
        const filesList = await getFilesList();
        if (!filesList || filesList.length === 0) {
            return null;
        }
        
        // characterName should already be normalized, but normalize for safety
        const normalizedCharacterName = normalizeCharacterName(characterName);
        
        const currentChatId = currentChatOnly ? getNormalizedChatId() : null;
        
        const parsedFiles = parseFilesList(filesList, parseSaveFilename);
        
        const characterFiles = [];
        
        for (const file of parsedFiles) {
            if (!file.parsed) {
                continue;
            }
            
            if (currentChatOnly && file.parsed.chatId !== currentChatId) {
                continue;
            }
            
            // Check by characterName in filename (primary method for group chat mode)
            if (file.parsed.characterName) {
                const normalizedParsedName = normalizeCharacterName(file.parsed.characterName);
                if (normalizedParsedName === normalizedCharacterName) {
                    characterFiles.push({
                        filename: file.name,
                        timestamp: file.parsed.timestamp,
                        chatId: file.parsed.chatId
                    });
                    continue; // Found by characterName, no need to check fallback
                }
            }
            
            // Also check by filename (fallback, less reliable method)
            if (file.name.includes(normalizedCharacterName) || file.name.includes(characterName)) {
                const alreadyAdded = characterFiles.some(f => f.filename === file.name);
                if (!alreadyAdded) {
                    characterFiles.push({
                        filename: file.name,
                        timestamp: file.parsed.timestamp,
                        chatId: file.parsed.chatId
                    });
                }
            }
        }
        
        if (characterFiles.length === 0) {
            return null;
        }
        
        sortByTimestamp(characterFiles);
        
        const lastFile = characterFiles[0];
        
        return {
            filename: lastFile.filename,
        };
    } catch (e) {
        console.error(`[KV Cache Manager] Error searching cache for character ${characterName}:`, e);
        return null;
    }
}

/**
 * Validate saved cache file size
 * @param {string} filename - Filename to check
 * @param {string} characterName - Character name (for notifications)
 * @returns {Promise<boolean>} true if file is valid, false if file is too small and was deleted
 */
export async function validateCacheFile(filename, characterName) {
    try {
        // Wait a bit to ensure file is saved on server
        await new Promise(resolve => setTimeout(resolve, FILE_CHECK_DELAY_MS));
        
        const filesList = await getFilesList();
        const savedFile = filesList.find(file => file.name === filename);
        
        if (savedFile) {
            const fileSizeMB = savedFile.size / (1024 * 1024);
            
            if (fileSizeMB < MIN_FILE_SIZE_MB) {
                console.warn(`[KV Cache Manager] File ${filename} is too small (${fileSizeMB.toFixed(2)} MB), deleting as invalid`);
                await deleteFile(filename);
                showToast('warning', `Файл кеша для ${characterName} слишком мал, не сохранён`);
                return false;
            }
        }
        
        return true;
    } catch (e) {
        console.warn(`[KV Cache Manager] Failed to check file size for ${filename}:`, e);
        // Continue even if size check failed
        return true;
    }
}

