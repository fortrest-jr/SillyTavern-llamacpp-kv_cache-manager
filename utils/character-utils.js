import { getContext } from "../../../../extensions.js";
import { getGroupMembers, selected_group, groups } from '../../../../group-chats.js';

import { normalizeCharacterName } from './utils.js';

/**
 * Get current chat characters with mute status information
 * Works only for group chats
 * @returns {Array<{name: string, normalizedName: string, characterId: string, avatar: string, isMuted: boolean}>}
 */
export function getChatCharactersWithMutedStatus() {
    try {
        const context = getContext();
        
        if (!context) {
            console.warn('[KV Cache Manager] Failed to get chat context');
            return [];
        }
        
        if (context.groupId === null || context.groupId === undefined) {
            return [];
        }
        
        const groupMembers = getGroupMembers();
        
        if (!groupMembers || groupMembers.length === 0) {
            console.warn('[KV Cache Manager] No group chat members found');
            return [];
        }
        
        const group = groups?.find(x => x.id === selected_group);
        const disabledMembers = group?.disabled_members ?? [];
        
        const characters = groupMembers
            .filter(member => member && member.name && typeof member.name === 'string')
            .map(member => {
                const normalizedName = normalizeCharacterName(member.name);
                // Check if character is muted (check for avatar in disabledMembers)
                const isMuted = disabledMembers.includes(member.avatar);
                
                let characterId = null;
                if (context.characters) {
                    const characterEntry = Object.entries(context.characters).find(
                        ([id, char]) => char && char.name === member.name
                    );
                    if (characterEntry) {
                        characterId = Number(characterEntry[0]);
                    }
                }
                
                return {
                    name: member.name,
                    normalizedName: normalizedName,
                    characterId: characterId,
                    avatar: member.avatar,
                    isMuted: isMuted
                };
            });
        
        return characters;
    } catch (e) {
        console.error('[KV Cache Manager] Error getting characters with mute status:', e);
        return [];
    }
}

/**
 * Get normalized character name from generation context
 * @returns {string|null} Normalized character name or null
 */
export function getNormalizedCharacterNameFromContext() {
    try {
        const context = getContext();
        
        if (!context || !context.characterId) {
            return null;
        }
        
        const character = context.characters[context.characterId];
        if (!character || !character.name) {
            return null;
        }
        
        return normalizeCharacterName(character.name);
    } catch (e) {
        console.error('[KV Cache Manager] Error getting character name from context:', e);
        return null;
    }
}

/**
 * Get normalized character name from event data
 * @param {any} data - Event data
 * @returns {string|null} Normalized character name or null
 */
export function getNormalizedCharacterNameFromData(data) {
    if (!data) {
        return null;
    }
    
    const characterName = data?.char || data?.name || null;
    if (!characterName || typeof characterName !== 'string') {
        return null;
    }
    
    return normalizeCharacterName(characterName);
}

