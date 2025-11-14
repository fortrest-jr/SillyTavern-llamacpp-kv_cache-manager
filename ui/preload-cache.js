import { getContext } from "../../../../extensions.js";
import { generateQuietPrompt } from "../../../../../script.js";

import { saveCharacterCache } from '../core/cache-operations.js';
import { showToast, disableAllSaveButtons, enableAllSaveButtons } from './ui.js';
import { setPreloadingMode, setCurrentPreloadCharacter, getCurrentSlot } from '../interceptors/generation-interceptor.js';
import { createHiddenMessage, editMessageUsingUpdate } from './hidden-message.js';
import { getExtensionSettings } from '../settings.js';

function updateCancelButtonHandler(messageId, handleCancel) {
    setTimeout(() => {
        const cancelButton = $(`#kv-cache-preload-cancel-btn-${messageId}`);
        if (cancelButton.length > 0) {
            cancelButton.off('click').on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            });
        }
    }, 100);
}

function formatPreloadStatus(current, total, preloaded, errors, currentCharacterName = null, currentSlotIndex = null, isCancelled = false, messageId = null) {
    const remaining = total - current;
    const progress = total > 0 ? Math.round((current / total) * 100) : 0;
    
    let status = `**Предзагрузка кеша**\n\n`;
    
    if (isCancelled) {
        status += `⚠️ **Отменено**\n\n`;
    } else {
        if (currentCharacterName) {
            if (currentSlotIndex !== null && currentSlotIndex !== undefined) {
                status += `Прогревается: **${currentCharacterName}** (слот ${currentSlotIndex})\n\n`;
            } else {
                status += `Прогревается: **${currentCharacterName}**\n\n`;
            }
        }
    }
    
    status += `Прогресс: ${current}/${total} (${progress}%)\n`;
    status += `Прогрето: ${preloaded.length}\n`;
    status += `Осталось: ${remaining}\n`;
    
    if (preloaded.length > 0) {
        status += `\n**Прогретые персонажи:**\n`;
        preloaded.forEach((name, idx) => {
            status += `${idx + 1}. ${name}\n`;
        });
    }
    
    if (errors.length > 0) {
        status += `\n**Ошибки:**\n`;
        errors.forEach((error, idx) => {
            status += `${idx + 1}. ${error}\n`;
        });
    }
    
    if (!isCancelled && current < total && messageId !== null) {
        status += `\n\n<button id="kv-cache-preload-cancel-btn-${messageId}" class="menu_button" type="button">Отменить</button>`;
    }
    
    return status;
}

/**
 * Preload cache for selected characters
 * @param {Array<{name: string, normalizedName: string, characterId: string, avatar: string, isMuted: boolean}>} characters - Array of characters to preload
 * @returns {Promise<boolean>} true if preload completed
 */
export async function preloadCharactersCache(characters) {
    const context = getContext();
    if (!context || context.groupId === null || context.groupId === undefined) {
        showToast('error', 'Предзагрузка доступна только для групповых чатов');
        return false;
    }
    
    if (!characters || characters.length === 0) {
        showToast('warning', 'Не выбрано персонажей для предзагрузки');
        return false;
    }
    
    setPreloadingMode(true);
    
    disableAllSaveButtons();
    
    let statusMessageId = null;
    const preloaded = [];
    const errors = [];
    let isCancelled = false;
    let currentGenerationTask = null;
    
    const stopGeneration = (generationTask = null) => {
        const context = getContext();
        return context.stopGeneration();
    };
    
    const handleCancel = () => {
        if (isCancelled) {
            return;
        }
        
        isCancelled = true;
        
        stopGeneration();
        
        if (statusMessageId !== null) {
            const status = formatPreloadStatus(
                preloaded.length, 
                characters.length, 
                preloaded, 
                [...errors, 'Cancelled by user'], 
                null, 
                null, 
                true, 
                statusMessageId
            );
            editMessageUsingUpdate(statusMessageId, status);
        }
    };
    
    try {
        const initialStatus = formatPreloadStatus(0, characters.length, [], [], null, null, false, null);
        statusMessageId = await createHiddenMessage(initialStatus, true);
        
        setTimeout(() => {
            const cancelButton = $(`#kv-cache-preload-cancel-btn-${statusMessageId}`);
            if (cancelButton.length > 0) {
                cancelButton.off('click').on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancel();
                });
            }
        }, 500);
        
        for (let i = 0; i < characters.length; i++) {
            if (isCancelled) {
                break;
            }
            
            const character = characters[i];
            const characterName = character.name;
            const normalizedName = character.normalizedName;
            const characterId = character.characterId;
            
            if (!characterId) {
                console.error(`[KV Cache Manager] [${characterName}] Character ID not found`);
                errors.push(`${characterName}: не найден ID персонажа`);
                if (statusMessageId !== null) {
                    const status = formatPreloadStatus(i + 1, characters.length, preloaded, errors, characterName, null, isCancelled, statusMessageId);
                    await editMessageUsingUpdate(statusMessageId, status);
                    updateCancelButtonHandler(statusMessageId, handleCancel);
                }
                continue;
            }
            
            try {
                if (isCancelled) {
                    break;
                }
                
                if (statusMessageId !== null) {
                    const status = formatPreloadStatus(i, characters.length, preloaded, errors, characterName, null, isCancelled, statusMessageId);
                    await editMessageUsingUpdate(statusMessageId, status);
                    updateCancelButtonHandler(statusMessageId, handleCancel);
                }
                
                const extensionSettings = getExtensionSettings();
                const timeoutMinutes = extensionSettings.preloadTimeout;
                const timeoutMs = timeoutMinutes * 60 * 1000;
                
                try {
                    if (isCancelled) {
                        break;
                    }
                    
                    // Set current character for generation interceptor
                    // Needed because context may not be updated yet after forceChId
                    setCurrentPreloadCharacter(normalizedName);
                    
                    currentGenerationTask = generateQuietPrompt({
                        forceChId: Number(characterId),
                        responseLength: 1
                    });
                    
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`Таймаут ожидания генерации (${timeoutMinutes} минут)`));
                        }, timeoutMs);
                    });
                    
                    let cancelCheckInterval = null;
                    const cancelCheckPromise = new Promise((resolve) => {
                        cancelCheckInterval = setInterval(() => {
                            if (isCancelled) {
                                clearInterval(cancelCheckInterval);
                                stopGeneration(currentGenerationTask);
                                resolve('cancelled');
                            }
                        }, 100);
                    });
                    
                    try {
                        const result = await Promise.race([
                            currentGenerationTask.then(() => {
                                if (cancelCheckInterval) {
                                    clearInterval(cancelCheckInterval);
                                }
                                return 'completed';
                            }).catch((e) => {
                                console.error(`[KV Cache Manager] [${characterName}] Generation completed with error:`, e);
                                if (cancelCheckInterval) {
                                    clearInterval(cancelCheckInterval);
                                }
                                throw e;
                            }),
                            timeoutPromise.catch((e) => {
                                if (cancelCheckInterval) {
                                    clearInterval(cancelCheckInterval);
                                }
                                throw e;
                            }),
                            cancelCheckPromise.then((result) => {
                                return result;
                            })
                        ]);
                        
                        if (isCancelled || result === 'cancelled') {
                            stopGeneration(currentGenerationTask);
                            break;
                        }
                        
                        stopGeneration(currentGenerationTask);
                    } catch (e) {
                        if (cancelCheckInterval) {
                            clearInterval(cancelCheckInterval);
                        }
                        throw e;
                    }
                    
                } catch (e) {
                    // If error is related to stopping generation - this is normal
                    const isAbortError = e.message && (e.message.includes('aborted') || e.message.includes('AbortError') || e.message.includes('cancelled'));
                    const isTimeout = e.message && (e.message.includes('Таймаут') || e.message.includes('Timeout') || e.message.includes('timeout'));
                    
                    if (!isAbortError && !isTimeout) {
                        console.error(`[KV Cache Manager] [${characterName}] Exception in generation block:`, e);
                        throw e;
                    }
                } finally {
                    setCurrentPreloadCharacter(null);
                    currentGenerationTask = null;
                }
                
                // Get slot from interceptor (it was set during generation)
                const slotIndex = getCurrentSlot();
                
                if (slotIndex !== null) {
                    const saved = await saveCharacterCache(normalizedName, slotIndex);
                    
                    if (saved) {
                        preloaded.push(characterName);
                    } else {
                        console.error(`[KV Cache Manager] [${characterName}] Error saving cache`);
                        errors.push(`${characterName}: ошибка сохранения кеша`);
                    }
                }
                
                if (isCancelled) {
                    break;
                }
                
                if (statusMessageId !== null) {
                    let nextCharacterName = null;
                    let nextSlotIndex = null;
                    if (i + 1 < characters.length) {
                        nextCharacterName = characters[i + 1].name;
                        // Slot for next character not yet obtained, so null
                    }
                    const status = formatPreloadStatus(i + 1, characters.length, preloaded, errors, nextCharacterName, nextSlotIndex, isCancelled, statusMessageId);
                    await editMessageUsingUpdate(statusMessageId, status);
                    updateCancelButtonHandler(statusMessageId, handleCancel);
                }
                
            } catch (e) {
                console.error(`[KV Cache Manager] Error preloading cache for character ${characterName}:`, e);
                errors.push(`${characterName}: ${e.message || 'Неизвестная ошибка'}`);
                
                if (statusMessageId !== null) {
                    const nextCharacterName = i + 1 < characters.length ? characters[i + 1].name : null;
                    const status = formatPreloadStatus(i + 1, characters.length, preloaded, errors, nextCharacterName, null, isCancelled, statusMessageId);
                    await editMessageUsingUpdate(statusMessageId, status);
                    updateCancelButtonHandler(statusMessageId, handleCancel);
                }
            }
        }
        
        if (statusMessageId !== null) {
            const finalStatus = formatPreloadStatus(
                isCancelled ? preloaded.length : characters.length, 
                characters.length, 
                preloaded, 
                errors, 
                null, 
                null, 
                isCancelled, 
                statusMessageId
            );
            await editMessageUsingUpdate(statusMessageId, finalStatus);
        }
        
        if (preloaded.length > 0) {
            if (errors.length > 0) {
                showToast('warning', `Предзагружено ${preloaded.length} из ${characters.length} персонажей. Ошибки: ${errors.length}`, 'Предзагрузка');
            } else {
                showToast('success', `Успешно предзагружено ${preloaded.length} персонажей`, 'Предзагрузка');
            }
            
            return true;
        } else {
            showToast('error', `Не удалось предзагрузить кеши. Ошибки: ${errors.length}`, 'Предзагрузка');
            return false;
        }
        
    } finally {
        setPreloadingMode(false);
        
        enableAllSaveButtons();
    }
}

