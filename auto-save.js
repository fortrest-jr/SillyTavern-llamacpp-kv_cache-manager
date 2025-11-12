// Автосохранение для KV Cache Manager

import { getNormalizedChatId, normalizeCharacterName } from './utils.js';
import { getSlotsState, findCharacterSlotIndex } from './slot-manager.js';
import { saveCharacterCache } from './cache-operations.js';
import { getExtensionSettings } from './settings.js';
import { getNormalizedCharacterNameFromData } from './generation-interceptor.js';

// Счетчик сообщений для каждого персонажа в каждом чата (для автосохранения)
// Структура: { [chatId]: { [characterName]: count } }
let messageCounters = {};

// Получение счетчиков сообщений
export function getMessageCounters() {
    return messageCounters;
}

// Сброс счетчика для персонажа в чате
export function resetMessageCounter(chatId, characterName) {
    if (messageCounters[chatId] && messageCounters[chatId][characterName] !== undefined) {
        messageCounters[chatId][characterName] = 0;
    }
}

// Сброс всех счетчиков для чата
export function resetChatCounters(chatId) {
    if (messageCounters[chatId]) {
        for (const characterName in messageCounters[chatId]) {
            messageCounters[chatId][characterName] = 0;
        }
    }
}

// Обновление индикатора следующего сохранения
// Показывает минимальное оставшееся количество сообщений среди всех персонажей
export function updateNextSaveIndicator() {
    const extensionSettings = getExtensionSettings();
    
    const indicator = $("#kv-cache-next-save");
    const headerTitle = $(".kv-cache-manager-settings .inline-drawer-toggle.inline-drawer-header b");
    
    if (indicator.length === 0 && headerTitle.length === 0) {
        return;
    }
    
    if (!extensionSettings.enabled) {
        if (indicator.length > 0) {
            indicator.text("Автосохранение отключено");
        }
        if (headerTitle.length > 0) {
            headerTitle.text("KV Cache Manager");
        }
        return;
    }
    
    const chatId = getNormalizedChatId();
    const chatCounters = messageCounters[chatId] || {};
    const interval = extensionSettings.saveInterval;
    
    // Находим минимальное оставшееся количество сообщений среди всех персонажей
    let minRemaining = Infinity;
    let hasCounters = false;
    
    for (const characterName in chatCounters) {
        hasCounters = true;
        const count = chatCounters[characterName] || 0;
        const remaining = Math.max(0, interval - count);
        if (remaining < minRemaining) {
            minRemaining = remaining;
        }
    }
    
    // Если нет счетчиков, показываем полный интервал
    if (!hasCounters) {
        minRemaining = interval;
    }
    
    // Обновляем индикатор в настройках
    if (indicator.length > 0) {
        if (minRemaining === 0) {
            indicator.text("Следующее сохранение при следующем сообщении");
        } else {
            const messageWord = minRemaining === 1 ? 'сообщение' : minRemaining < 5 ? 'сообщения' : 'сообщений';
            indicator.text(`Следующее сохранение через: ${minRemaining} ${messageWord}`);
        }
    }
    
    // Обновляем заголовок расширения с числом в квадратных скобках
    if (headerTitle.length > 0) {
        headerTitle.text(`[${minRemaining}] KV Cache Manager`);
    }
}

// Увеличение счетчика сообщений для конкретного персонажа
// @param {string} characterName - Имя персонажа (будет нормализовано)
export async function incrementMessageCounter(characterName) {
    const extensionSettings = getExtensionSettings();
    
    if (!extensionSettings.enabled) {
        return;
    }
    
    if (!characterName) {
        // Если имя персонажа не указано, пропускаем
        return;
    }
    
    // Нормализуем имя персонажа
    const normalizedName = normalizeCharacterName(characterName);
    
    const chatId = getNormalizedChatId();
    if (!messageCounters[chatId]) {
        messageCounters[chatId] = {};
    }
    
    if (!messageCounters[chatId][normalizedName]) {
        messageCounters[chatId][normalizedName] = 0;
    }
    
    messageCounters[chatId][normalizedName]++;
    
    updateNextSaveIndicator();
    
    // Проверяем, нужно ли сохранить для этого персонажа
    const interval = extensionSettings.saveInterval;
    if (messageCounters[chatId][normalizedName] >= interval) {
        // Находим слот, в котором находится персонаж
        // characterName уже нормализован, имена в slotsState тоже нормализованы
        const slotsState = getSlotsState();
        let slotIndex = findCharacterSlotIndex(normalizedName);
        
        if (slotIndex !== null) {
            // Запускаем автосохранение для этого персонажа
            try {
                const success = await saveCharacterCache(normalizedName, slotIndex);
                if (success) {
                    // Сбрасываем счетчик только после успешного сохранения
                    messageCounters[chatId][normalizedName] = 0;
                    updateNextSaveIndicator();
                }
            } catch (e) {
                // При ошибке не сбрасываем счетчик, чтобы попробовать сохранить снова
                console.error(`[KV Cache Manager] Ошибка при автосохранении кеша для персонажа ${normalizedName}:`, e);
            }
        } else {
            console.warn(`[KV Cache Manager] Не удалось найти слот для сохранения персонажа ${normalizedName}`);
        }
    }
}

// Обработка события получения сообщения для автосохранения
export async function onMessageReceived(data) {
    // Получаем нормализованное имя персонажа из данных события
    const characterName = getNormalizedCharacterNameFromData(data);
    await incrementMessageCounter(characterName);
}
