// Перехватчик генерации для KV Cache Manager

import { getContext } from "../../../../extensions.js";

import { formatTimestampToDate } from '../utils/utils.js';
import { getSlotsState, acquireSlot } from '../core/slot-manager.js';
import { loadSlotCache } from '../core/cache-operations.js';
import { getLastCacheForCharacter, parseSaveFilename } from '../core/file-manager.js';
import { showToast } from '../ui/ui.js';
import { getNormalizedCharacterNameFromContext, getNormalizedCharacterNameFromData } from '../utils/character-utils.js';
import { MIN_USAGE_FOR_SAVE } from '../settings.js';

// Текущий слот для генерации
let currentSlot = null;

// Флаг режима предзагрузки
let isPreloading = false;

// Текущий персонаж для предзагрузки (используется вместо контекста, т.к. контекст может быть не обновлен)
let currentPreloadCharacter = null;

// Установка флага режима предзагрузки
export function setPreloadingMode(enabled) {
    isPreloading = enabled;
    if (!enabled) {
        currentPreloadCharacter = null; // Очищаем при выключении
    }
}

// Установка текущего персонажа для предзагрузки
export function setCurrentPreloadCharacter(normalizedName) {
    currentPreloadCharacter = normalizedName;
}

// Получение текущего слота
export function getCurrentSlot() {
    return currentSlot;
}

// Функция-перехватчик генерации для загрузки кеша персонажа в слоты
/**
 * Перехватчик генерации для загрузки кеша персонажа в слоты
 * @param {any[]} chat - Массив сообщений чата
 * @param {number} contextSize - Размер контекста
 * @param {function(boolean): void} abort - Функция для остановки генерации
 * @param {string} type - Тип генерации ('normal', 'regenerate', 'swipe', 'quiet', 'impersonate', 'continue')
 */
export async function KVCacheManagerInterceptor(chat, contextSize, abort, type) {
    // Пропускаем impersonate
    if (type === 'impersonate') {
        return;
    }
    
    // Обрабатываем тихие генерации только во время предзагрузки
    if (type === 'quiet' && !isPreloading) {
        return;
    }
    
    try {
        // В режиме предзагрузки для тихих генераций используем сохраненное имя персонажа
        // вместо контекста, т.к. контекст может быть еще не обновлен после forceChId
        const characterName = (type === 'quiet' && isPreloading && currentPreloadCharacter) 
            ? currentPreloadCharacter 
            : getNormalizedCharacterNameFromContext();
        
        if (!characterName) {
            return;
        }
        
        const slotsState = getSlotsState();
        currentSlot = await acquireSlot(characterName, MIN_USAGE_FOR_SAVE);
        
        if (currentSlot === null) {
            showToast('error', t`Failed to acquire slot for character ${characterName} during generation`, t`Generation`);
            return;
        }
        
        // Управление счетчиком использования происходит здесь, в перехватчике генерации
        // Загружаем кеш только если он еще не загружен в слот
        const slot = slotsState[currentSlot];
        const cacheNotLoaded = !slot?.cacheLoaded;
        
        if (cacheNotLoaded) {
            try {
                const cacheInfo = await getLastCacheForCharacter(characterName, true); // Только из текущего чата
                
                if (cacheInfo) {
                    const loaded = await loadSlotCache(currentSlot, cacheInfo.filename);
                    
                    if (loaded) {
                        // Форматируем дату-время из timestamp для тоста
                        const parsed = parseSaveFilename(cacheInfo.filename);
                        if (parsed && parsed.timestamp) {
                            const dateTimeStr = formatTimestampToDate(parsed.timestamp);
                            showToast('success', t`Cache for ${characterName} loaded (${dateTimeStr})`, t`Generation`);
                        } else {
                            showToast('success', t`Cache for ${characterName} loaded`, t`Generation`);
                        }
                    } else {
                        showToast('warning', t`Failed to load cache for ${characterName}`, t`Generation`);
                    }
                }
            } catch (e) {
                console.error(`[KV Cache Manager] Error loading cache for character ${characterName}:`, e);
                showToast('error', t`Error loading cache for ${characterName}: ${e.message}`, t`Generation`);
                // Не прерываем генерацию при ошибке загрузки кеша
            }
        }
        
        // Сохраняем тип генерации в слот для использования в processMessageForAutoSave
        // Увеличение usage происходит в processMessageForAutoSave по событию MESSAGE_RECEIVED
        slotsState[currentSlot].generationType = type;
        
    } catch (error) {
        console.error('[KV Cache Manager] Error in generation interceptor:', error);
        showToast('error', t`Error intercepting generation: ${error.message}`, t`Generation`);
    }
}

// Обработка события готовности настроек генерации
// Устанавливает id_slot для генерации
export function setSlotForGeneration(params) {
    const slot = getCurrentSlot();
    if (slot !== null) {
        params["id_slot"] = slot;
    }
}

