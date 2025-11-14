import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../../../scripts/popup.js';
import { t } from '../../../../i18n.js';

import { showToast } from './ui.js';
import { extensionFolderPath } from '../settings.js';
import { getChatCharactersWithMutedStatus } from '../utils/character-utils.js';

let preloadPopupData = {
    characters: [],
    selectedCharacters: new Set(),
    searchQuery: '',
    currentPopup: null
};

function setupPreloadPopupHandlers() {
    $(document).off('input', '#kv-cache-preload-search-input').on('input', '#kv-cache-preload-search-input', function() {
        const query = $(this).val();
        const popupDlg = $(this).closest('.popup, dialog');
        updateSearchQuery(query, popupDlg.length ? popupDlg[0] : document);
    });
    
    $(document).off('change', '#kv-cache-preload-select-all-checkbox').on('change', '#kv-cache-preload-select-all-checkbox', function() {
        const isChecked = $(this).is(':checked');
        const popupDlg = $(this).closest('.popup, dialog');
        const context = popupDlg.length ? popupDlg[0] : document;
        
        if (isChecked) {
            selectAllCharacters(context);
        } else {
            deselectAllCharacters(context);
        }
    });
}

export async function openPreloadPopup() {
    const characters = getChatCharactersWithMutedStatus();
    
    if (!characters || characters.length === 0) {
        showToast('warning', 'No characters found for preload (group chats only)');
        return null;
    }
    
    preloadPopupData.characters = characters;
    preloadPopupData.selectedCharacters = new Set();
    preloadPopupData.searchQuery = '';
    
    characters.forEach(char => {
        if (!char.isMuted) {
            preloadPopupData.selectedCharacters.add(char.normalizedName);
        }
    });
    
    const popupHTML = await $.get(`${extensionFolderPath}/preload-popup.html`);
    
    let preloadPerformed = false;
    
    const performPreload = async () => {
        if (preloadPopupData.selectedCharacters.size === 0) {
            showToast('error', 'No characters selected');
            return false;
        }
        
        preloadPerformed = true;
        return true;
    };
    
    const popupPromise = callGenericPopup(
        popupHTML,
        POPUP_TYPE.TEXT,
        '',
        {
            large: true,
            allowVerticalScrolling: true,
            okButton: 'Start Preload',
            cancelButton: true,
            onOpen: async (popup) => {
                preloadPopupData.currentPopup = popup;
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const popupContent = popup.content.querySelector('#kv-cache-preload-popup-content');
                if (!popupContent) {
                    console.error('[KV Cache Manager] Popup content not found in', popup.content);
                    return;
                }
                
                setupPreloadPopupHandlers();
                
                renderPreloadPopupCharacters(popup.dlg);
                
                updatePreloadPopupSelection(popup.dlg);
            },
            onClosing: async (popup) => {
                if (popup.result === POPUP_RESULT.AFFIRMATIVE && !preloadPerformed) {
                    if (preloadPopupData.selectedCharacters.size === 0) {
                        showToast('error', 'No characters selected');
                        return false;
                    }
                    return true;
                }
                return true;
            },
            onClose: async (popup) => {
                preloadPopupData.currentPopup = null;
            }
        }
    );
    
    const result = await popupPromise;
    
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        return Array.from(preloadPopupData.selectedCharacters).map(normalizedName => {
            return preloadPopupData.characters.find(c => c.normalizedName === normalizedName);
        }).filter(Boolean);
    }
    
    return null;
}

export function renderPreloadPopupCharacters(context = document) {
    const charactersList = $(context).find("#kv-cache-preload-characters-list");
    if (charactersList.length === 0) {
        console.error('[KV Cache Manager] Element #kv-cache-preload-characters-list not found in context', context);
        return;
    }
    
    const characters = preloadPopupData.characters;
    const searchQuery = preloadPopupData.searchQuery.toLowerCase();
    
    if (characters.length === 0) {
        charactersList.html(`<div class="kv-cache-preload-empty">${t`No characters for preload`}</div>`);
        return;
    }
    
    const filteredCharacters = characters.filter(character => {
        if (!searchQuery) return true;
        return character.name.toLowerCase().includes(searchQuery) || 
               character.normalizedName.toLowerCase().includes(searchQuery);
    });
    
    if (filteredCharacters.length === 0) {
        charactersList.html(`<div class="kv-cache-preload-empty">${t`No characters found for query`}</div>`);
        return;
    }
    
    charactersList.empty();
    
    for (const character of filteredCharacters) {
        const isSelected = preloadPopupData.selectedCharacters.has(character.normalizedName);
        const mutedClass = character.isMuted ? 'kv-cache-preload-character-muted' : '';
        
        const characterElement = $(`
            <div class="kv-cache-preload-character-item ${mutedClass}" data-character-name="${character.normalizedName}">
                <label style="display: flex; align-items: center; cursor: pointer; padding: 8px;">
                    <input type="checkbox" 
                           class="kv-cache-preload-character-checkbox" 
                           data-character-name="${character.normalizedName}"
                           ${isSelected ? 'checked' : ''} 
                           style="margin-right: 10px;" />
                    <div style="flex: 1; text-align: left;">
                        <div style="text-align: left;">
                            <i class="fa-solid fa-user" style="margin-right: 5px;"></i>
                            ${character.name}
                        </div>
                        ${character.isMuted ? `<div style="font-size: 0.85em; margin-top: 2px; text-align: left;">${t`(muted)`}</div>` : ''}
                    </div>
                </label>
            </div>
        `);
        
        characterElement.find('.kv-cache-preload-character-checkbox').on('change', function() {
            const normalizedName = $(this).data('character-name');
            const isChecked = $(this).is(':checked');
            
            if (isChecked) {
                preloadPopupData.selectedCharacters.add(normalizedName);
            } else {
                preloadPopupData.selectedCharacters.delete(normalizedName);
            }
            
            const popupDlg = $(this).closest('.popup, dialog');
            const context = popupDlg.length ? popupDlg[0] : document;
            updateSelectAllCheckbox(context);
            
            updatePreloadPopupSelection(context);
        });
        
        charactersList.append(characterElement);
    }
    
    updateSelectAllCheckbox(context);
}

function updateSelectAllCheckbox(context = document) {
    const allCheckboxes = $(context).find('.kv-cache-preload-character-checkbox');
    const checkedCheckboxes = $(context).find('.kv-cache-preload-character-checkbox:checked');
    const selectAllCheckbox = $(context).find('#kv-cache-preload-select-all-checkbox');
    
    if (allCheckboxes.length === 0) {
        selectAllCheckbox.prop('checked', false);
        selectAllCheckbox.prop('indeterminate', false);
        return;
    }
    
    if (checkedCheckboxes.length === 0) {
        selectAllCheckbox.prop('checked', false);
        selectAllCheckbox.prop('indeterminate', false);
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
        selectAllCheckbox.prop('checked', true);
        selectAllCheckbox.prop('indeterminate', false);
    } else {
        selectAllCheckbox.prop('checked', false);
        selectAllCheckbox.prop('indeterminate', true);
    }
}

export function updatePreloadPopupSelection(context = document) {
    const selectedCount = preloadPopupData.selectedCharacters.size;
    const selectedInfo = $(context).find("#kv-cache-preload-selected-info");
    
    if (selectedInfo.length === 0) {
        return;
    }
    
    updateSelectAllCheckbox(context);
    
    const preloadButton = preloadPopupData.currentPopup?.okButton;
    
    if (selectedCount === 0) {
        selectedInfo.text('No characters selected');
        if (preloadButton) {
            preloadButton.disabled = true;
        }
    } else {
        const selectedNames = Array.from(preloadPopupData.selectedCharacters)
            .map(normalizedName => {
                const char = preloadPopupData.characters.find(c => c.normalizedName === normalizedName);
                return char ? char.name : normalizedName;
            })
            .join(', ');
        
        const characterPlural = selectedCount !== 1 ? 's' : '';
        selectedInfo.html(`<strong>${t`Selected: ${selectedCount} character${characterPlural} (${selectedNames})`}</strong>`);
        if (preloadButton) {
            preloadButton.disabled = false;
        }
    }
}

function selectAllCharacters(context = document) {
    $(context).find('.kv-cache-preload-character-checkbox').each(function() {
        const normalizedName = $(this).data('character-name');
        if (normalizedName) {
            preloadPopupData.selectedCharacters.add(normalizedName);
            $(this).prop('checked', true);
        }
    });
    
    updateSelectAllCheckbox(context);
    
    updatePreloadPopupSelection(context);
}

function deselectAllCharacters(context = document) {
    preloadPopupData.selectedCharacters.clear();
    
    $(context).find('.kv-cache-preload-character-checkbox').prop('checked', false);
    
    updateSelectAllCheckbox(context);
    
    updatePreloadPopupSelection(context);
}

export function updateSearchQuery(query, context = document) {
    preloadPopupData.searchQuery = query;
    renderPreloadPopupCharacters(context);
    updatePreloadPopupSelection(context);
}

