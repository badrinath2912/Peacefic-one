import type { AuthenticatedUser } from '@peacefic/shared';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  user: AuthenticatedUser | null;
  /** `true` until the session bootstrap has resolved one way or the other. */
  isBootstrapping: boolean;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  isBootstrapping: true,
  isAuthenticated: false,
};

/**
 * Only the user profile lives here. The access token is deliberately kept out
 * of Redux — it stays in a module-scoped variable in the api client so it is
 * never serialised into devtools, persisted, or snapshotted into an error report.
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionResolved(state, action: PayloadAction<AuthenticatedUser | null>) {
      state.user = action.payload;
      state.isAuthenticated = action.payload !== null;
      state.isBootstrapping = false;
    },
    userUpdated(state, action: PayloadAction<Partial<AuthenticatedUser>>) {
      if (state.user) Object.assign(state.user, action.payload);
    },
    signedOut(state) {
      state.user = null;
      state.isAuthenticated = false;
      state.isBootstrapping = false;
    },
  },
});

export const { sessionResolved, userUpdated, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
