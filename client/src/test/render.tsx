import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

interface ProviderProps {
  children: ReactNode;
  route: string;
}

function TestProviders({ children, route }: ProviderProps) {
  return (
    <MemoryRouter initialEntries={[route]}>
      {children}
    </MemoryRouter>
  );
}

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: ExtendedRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => <TestProviders route={route}>{children}</TestProviders>,
    ...options,
  });
}
