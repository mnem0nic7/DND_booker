import { setAccessToken } from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useAiStore } from '../stores/aiStore';
import { useAuthStore } from '../stores/authStore';
import { useExportStore } from '../stores/exportStore';
import { useGenerationStore } from '../stores/generationStore';
import { useProjectStore } from '../stores/projectStore';
import { useThemeStore } from '../stores/themeStore';

const initialProjectState = useProjectStore.getState();
const initialExportState = useExportStore.getState();
const initialGenerationState = useGenerationStore.getState();
const initialAgentState = useAgentStore.getState();
const initialAiState = useAiStore.getState();
const initialThemeState = useThemeStore.getState();
const initialAuthState = useAuthStore.getState();

export function resetAllStores() {
  useProjectStore.getState().cancelPendingSave();
  useExportStore.getState().reset();
  useGenerationStore.getState().unsubscribe();
  useGenerationStore.getState().reset();
  useAgentStore.getState().unsubscribe();
  useAgentStore.getState().reset();
  useAiStore.getState().cancelStream();
  useAiStore.getState().cancelWizardGeneration();
  useAiStore.getState().clearWizard();
  setAccessToken(null);
  localStorage.clear();

  useProjectStore.setState(initialProjectState, true);
  useExportStore.setState(initialExportState, true);
  useGenerationStore.setState(initialGenerationState, true);
  useAgentStore.setState(initialAgentState, true);
  useAiStore.setState(initialAiState, true);
  useThemeStore.setState(initialThemeState, true);
  useAuthStore.setState(initialAuthState, true);
}
