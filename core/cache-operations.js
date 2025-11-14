// Операции с кешем для KV Cache Manager
import LlamaApi from '../api/llama-api.js';
import { formatTimestamp, getNormalizedChatId } from '../utils/utils.js';
import { generateSaveFilename, rotateCharacterFiles, validateCacheFile } from './file-manager.js';
import { getAllSlotsInfo, getSlotsState, resetSlotUsage, setSlotCacheLoaded, getSlotsCountFromData, updateSlotsList } from './slot-manager.js';
import { showToast, disableAllSaveButtons, enableAllSaveButtons, showTagInputPopup } from '../ui/ui.js';
import { getExtensionSettings, MIN_USAGE_FOR_SAVE } from '../settings.js';

// Инициализация API клиента
const llamaApi = new LlamaApi();

// Сохранение кеша для слота
// @param {number} slotId - Индекс слота
// @param {string} filename - Имя файла для сохранения
// @param {string} characterName - Имя персонажа (обязательно)
export async function saveSlotCache(slotId, filename, characterName) {
    try {
        await llamaApi.saveSlotCache(slotId, filename);
        
        // Проверяем размер сохраненного файла
        const isValid = await validateCacheFile(filename, characterName);
        if (!isValid) {
            return false;
        }
        
        showToast('success', t`Cache for ${characterName} saved successfully`);
        
        return true;
    } catch (e) {
        console.error(`[KV Cache Manager] Error saving slot ${slotId}:`, e);
        const errorMessage = e.message || 'Unknown error';
        if (errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
            showToast('error', t`Timeout while saving cache for ${characterName}`);
        } else {
            showToast('error', t`Error saving cache for ${characterName}: ${errorMessage}`);
        }
        return false;
    }
}

// Загрузка кеша для слота
export async function loadSlotCache(slotId, filename) {
    try {
        await llamaApi.loadSlotCache(slotId, filename);
        
        // При любой загрузке кеша сбрасываем счетчик использования в 0 и помечаем кеш как загруженный
        resetSlotUsage(slotId);
        setSlotCacheLoaded(slotId, true);
        
        // Обновляем список слотов после загрузки
        updateSlotsList();
        
        return true;
    } catch (e) {
        console.error(`[KV Cache Manager] Error loading cache for slot ${slotId}:`, e);
        return false;
    }
}

// Очистка кеша для слота
export async function clearSlotCache(slotId) {
    try {
        await llamaApi.clearSlotCache(slotId);
        
        // Обновляем список слотов после очистки
        updateSlotsList();
        
        return true;
    } catch (e) {
        console.error(`[KV Cache Manager] Error clearing slot ${slotId}:`, e);
        return false;
    }
}

// Очистка всех слотов
export async function clearAllSlotsCache() {
    try {
        // Получаем информацию о всех слотах
        const slotsData = await getAllSlotsInfo();
        
        if (!slotsData) {
            return false;
        }
        
        // Определяем общее количество слотов
        const totalSlots = getSlotsCountFromData(slotsData);
        
        if (totalSlots === 0) {
            return true;
        }
        
        let clearedCount = 0;
        let errors = [];
        
        // Очищаем все слоты (от 0 до totalSlots - 1)
        for (let slotId = 0; slotId < totalSlots; slotId++) {
            try {
                if (await clearSlotCache(slotId)) {
                    clearedCount++;
                } else {
                    errors.push(`слот ${slotId}`);
                }
            } catch (e) {
                console.error(`[KV Cache Manager] Error clearing slot ${slotId}:`, e);
                errors.push(`слот ${slotId}: ${e.message}`);
            }
        }
        
        if (clearedCount > 0) {
            if (errors.length > 0) {
                showToast('warning', t`Cleared ${clearedCount} of ${totalSlots} slots. Errors: ${errors.join(', ')}`, t`Cache Clear`);
            } else {
                showToast('success', t`Successfully cleared ${clearedCount} slots`, t`Cache Clear`);
            }
            
            // Обновляем список слотов после очистки (clearSlotCache() уже обновляет после каждой очистки, но финальное обновление гарантирует актуальность)
            updateSlotsList();
            
            return true;
        } else {
            console.error(`[KV Cache Manager] Failed to clear slots. Errors: ${errors.join(', ')}`);
            showToast('error', t`Failed to clear slots. Errors: ${errors.join(', ')}`, t`Cache Clear`);
            return false;
        }
    } catch (e) {
        console.error('[KV Cache Manager] Error clearing all slots:', e);
        showToast('error', t`Error clearing slots: ${e.message}`, t`Cache Clear`);
        return false;
    }
}

// Сохранение кеша для персонажа (автосохранение)
// @param {string} characterName - Нормализованное имя персонажа
// @param {number} slotIndex - индекс слота
// @returns {Promise<boolean>} - true если кеш был сохранен, false если ошибка
export async function saveCharacterCache(characterName, slotIndex) {
    if (!characterName || typeof characterName !== 'string') {
        return false;
    }
    
    if (slotIndex === null || slotIndex === undefined) {
        return false;
    }
    
    try {
        const chatId = getNormalizedChatId();
        const timestamp = formatTimestamp();
        const filename = generateSaveFilename(chatId, timestamp, characterName);
        
        const success = await saveSlotCache(slotIndex, filename, characterName);
        
        if (success) {
            // Выполняем ротацию файлов для этого персонажа
            await rotateCharacterFiles(characterName);
            
            // Сбрасываем usage после успешного сохранения
            resetSlotUsage(slotIndex);
            
            return true;
        } else {
            console.error(`[KV Cache Manager] Failed to save cache for character ${characterName}`);
            return false;
        }
    } catch (e) {
        console.error(`[KV Cache Manager] Error saving cache for character ${characterName}:`, e);
        return false;
    }
}

// Сохранение кеша для всех персонажей, которые находятся в слотах
// Используется перед очисткой слотов при смене чата
export async function saveAllSlotsCache() {
    const slotsState = getSlotsState();
    const totalSlots = slotsState.length;
    
    // Отключаем все кнопки сохранения (кроме кнопок отдельных слотов)
    disableAllSaveButtons();
    
    try {
        // Сохраняем кеш для всех персонажей, которые были в слотах перед очисткой
        // Важно: дожидаемся завершения сохранения перед очисткой слотов, чтобы избежать потери данных
        for (let i = 0; i < totalSlots; i++) {
            const slot = slotsState[i];
            const currentCharacter = slot?.characterName;
            if (currentCharacter && typeof currentCharacter === 'string') {
                const usageCount = slot.usage || 0;
                
                // Сохраняем кеш перед вытеснением только если персонаж использовал слот минимум 2 раза
                if (usageCount >= MIN_USAGE_FOR_SAVE) {
                    await saveCharacterCache(currentCharacter, i);
                }
            }
        }
    } finally {
        // Включаем кнопки обратно
        enableAllSaveButtons();
    }
}

// Общая функция сохранения кеша
// Сохраняет всех персонажей, которые находятся в слотах
export async function saveCache(requestTag = false) {
    let tag = null;
    if (requestTag) {
        tag = await showTagInputPopup();
        if (tag === null) {
            return false;
        }
        tag = tag.trim();
    }
    
    // Получаем нормализованный ID чата
    const chatId = getNormalizedChatId();
    
    showToast('info', t`Starting cache save...`);
    
    // Получаем персонажей из слотов (они уже должны быть только из текущего чата)
    const slotsState = getSlotsState();
    const charactersToSave = [];
    
    slotsState.forEach((slot, slotIndex) => {
        const characterName = slot?.characterName;
        if (characterName && typeof characterName === 'string') {
            charactersToSave.push({
                characterName: characterName,
                slotIndex: slotIndex
            });
        }
    });
    
    if (charactersToSave.length === 0) {
        showToast('warning', t`No characters in slots to save`);
        return false;
    }
    
    const successfullySaved = []; // Список успешно сохраненных персонажей
    const saveErrors = []; // Список персонажей с проблемами сохранения
    
    const extensionSettings = getExtensionSettings();
    
    // Сохраняем каждого персонажа с индивидуальным timestamp
    for (const { characterName, slotIndex } of charactersToSave) {
        if (!characterName) {
            // Пропускаем, если имя персонажа не определено (временное решение для обычного режима)
            continue;
        }
        
        try {
            const timestamp = formatTimestamp();
            const filename = generateSaveFilename(chatId, timestamp, characterName, tag);
            
            if (await saveSlotCache(slotIndex, filename, characterName)) {
                successfullySaved.push(characterName);
                
                // Выполняем ротацию файлов для этого персонажа (только для автосохранений)
                if (!tag) {
                    await rotateCharacterFiles(characterName);
                }
            } else {
                saveErrors.push(characterName);
            }
        } catch (e) {
            console.error(`[KV Cache Manager] Error saving character ${characterName}:`, e);
            saveErrors.push(`${characterName}: ${e.message}`);
        }
    }
    
    // Возвращаем true при успешном сохранении (хотя бы один персонаж сохранен)
    return successfullySaved.length > 0;
}
