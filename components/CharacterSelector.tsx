"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface SearchCharacter {
  id: number;
  name: string;
  picture?: string;
}

interface CharacterSelectorProps {
  categoryId: number;
  selectedCharacterId: number | null;
  selectedCharacterName?: string;
  selectedCharacterImage?: string;
  onSelect: (characterId: number, characterName: string, characterImage?: string) => void;
  disabled?: boolean;
  disabledCharacters?: number[];
}

export function CharacterSelector({
  categoryId,
  selectedCharacterId,
  selectedCharacterName,
  selectedCharacterImage,
  onSelect,
  disabled = false,
  disabledCharacters = [],
}: CharacterSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isCharacterDisabled = (characterId: number) => {
    return disabledCharacters.includes(characterId);
  };

  // Debounced search
  const searchCharacters = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/categories/${categoryId}/search?q=${encodeURIComponent(query)}`,
        { signal: abortControllerRef.current.signal }
      );
      if (res.ok) {
        const data = await res.json();
        const personnages = data.personnages || [];
        setSearchResults(
          personnages
            .filter((p: SearchCharacter) => !isCharacterDisabled(p.id))
            .slice(0, 20)
        );
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("Search error:", e);
      }
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, disabledCharacters]);

  // Debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCharacters(searchTerm);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, searchCharacters]);

  useEffect(() => {
    if (searchTerm) {
      setIsDropdownVisible(true);
    } else {
      setIsDropdownVisible(false);
      setSearchResults([]);
    }
    setHighlightedIndex(0);
  }, [searchTerm]);

  const handleSelect = (character: SearchCharacter) => {
    if (isCharacterDisabled(character.id) || disabled) return;
    onSelect(character.id, character.name, character.picture);
    setSearchTerm("");
    setIsDropdownVisible(false);
    setSearchResults([]);
    inputRef.current?.focus();
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsDropdownVisible(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isDropdownVisible) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(searchResults.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = searchResults[highlightedIndex] || searchResults[0];
      if (selected) {
        handleSelect(selected);
      }
    }
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="flex justify-between items-center w-full">
        <div className="text-white w-full">
          <input
            ref={inputRef}
            type="text"
            placeholder="Tape un nom d'un personnage"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => searchTerm && setIsDropdownVisible(true)}
            disabled={disabled}
            className="rounded-lg py-2.5 px-4 w-full h-12 bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      {isDropdownVisible && (searchResults.length > 0 || isLoading) && (
        <div className="absolute bg-gradient-to-br from-[#1a1a2e] to-[#121217] border border-violet-500/30 rounded-xl shadow-2xl z-[9999] w-full mt-2">
          <div className="options max-h-80 overflow-y-auto scrollbar flex flex-col">
            {isLoading && searchResults.length === 0 ? (
              <div className="p-4 text-white/50 text-center">Recherche...</div>
            ) : (
              searchResults.map((character, index) => {
                const isDisabled = isCharacterDisabled(character.id);
                return (
                  <div key={character.id} onClick={() => !isDisabled && handleSelect(character)}>
                    <label
                      className={`flex items-center p-4 cursor-pointer text-white transition-colors ${
                        index === highlightedIndex ? "bg-white/10" : "hover:bg-white/10"
                      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="size-10 bg-white/10 rounded overflow-hidden">
                        {character.picture && (
                          <img
                            src={character.picture}
                            alt={character.name}
                            className="object-cover w-full h-full"
                          />
                        )}
                      </div>
                      <span className="ml-1.5 text-gray-200">
                        {character.name}
                        {isDisabled && " (déjà deviné)"}
                      </span>
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {selectedCharacterId && selectedCharacterName && (
        <div className="mt-4 flex items-center gap-4 p-4 bg-black/20 rounded-lg border border-white/10">
          {selectedCharacterImage && (
            <img
              src={selectedCharacterImage}
              alt={selectedCharacterName}
              className="size-16 rounded object-cover border-2 border-violet-500/30"
            />
          )}
          <span className="text-white font-semibold text-lg">{selectedCharacterName}</span>
        </div>
      )}
    </div>
  );
}
