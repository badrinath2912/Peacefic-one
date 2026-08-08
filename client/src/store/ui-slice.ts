import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
}

const initialState: UiState = {
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setCommandPaletteOpen(state, action: PayloadAction<boolean>) {
      state.commandPaletteOpen = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  setMobileNavOpen,
  setCommandPaletteOpen,
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;
