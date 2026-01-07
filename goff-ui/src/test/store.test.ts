import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from '../lib/store'

// Mock the API client
vi.mock('../lib/api', () => ({
  default: {
    setConfig: vi.fn(),
    getHealth: vi.fn(),
  },
}))

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      config: {
        proxyUrl: 'http://localhost:1031',
        apiKey: '',
        adminApiKey: '',
      },
      isConnected: false,
      connectionError: null,
      isDevMode: false,
      selectedProject: null,
      selectedFlagSet: null,
      flagUpdates: [],
    })
  })

  describe('config management', () => {
    it('should have default config', () => {
      const state = useAppStore.getState()
      expect(state.config.proxyUrl).toBe('http://localhost:1031')
      expect(state.config.apiKey).toBe('')
      expect(state.config.adminApiKey).toBe('')
    })

    it('should update config', () => {
      const newConfig = {
        proxyUrl: 'http://localhost:8080',
        apiKey: 'test-key',
        adminApiKey: 'admin-key',
      }

      act(() => {
        useAppStore.getState().setConfig(newConfig)
      })

      const state = useAppStore.getState()
      expect(state.config.proxyUrl).toBe('http://localhost:8080')
      expect(state.config.apiKey).toBe('test-key')
      expect(state.config.adminApiKey).toBe('admin-key')
    })

    it('should reset connection state when config changes', () => {
      // Set connected state
      useAppStore.setState({ isConnected: true, connectionError: 'old error' })

      act(() => {
        useAppStore.getState().setConfig({
          proxyUrl: 'http://new-url',
          apiKey: '',
          adminApiKey: '',
        })
      })

      const state = useAppStore.getState()
      expect(state.isConnected).toBe(false)
      expect(state.connectionError).toBe(null)
    })
  })

  describe('connection state', () => {
    it('should set connected state', () => {
      act(() => {
        useAppStore.getState().setConnected(true)
      })

      expect(useAppStore.getState().isConnected).toBe(true)
    })

    it('should set connection error', () => {
      act(() => {
        useAppStore.getState().setConnectionError('Connection refused')
      })

      expect(useAppStore.getState().connectionError).toBe('Connection refused')
    })

    it('should clear connection error', () => {
      useAppStore.setState({ connectionError: 'some error' })

      act(() => {
        useAppStore.getState().setConnectionError(null)
      })

      expect(useAppStore.getState().connectionError).toBe(null)
    })
  })

  describe('dev mode', () => {
    it('should start in production mode by default', () => {
      expect(useAppStore.getState().isDevMode).toBe(false)
    })

    it('should toggle dev mode', () => {
      act(() => {
        useAppStore.getState().setDevMode(true)
      })

      expect(useAppStore.getState().isDevMode).toBe(true)

      act(() => {
        useAppStore.getState().setDevMode(false)
      })

      expect(useAppStore.getState().isDevMode).toBe(false)
    })
  })

  describe('project selection', () => {
    it('should have no project selected by default', () => {
      expect(useAppStore.getState().selectedProject).toBe(null)
    })

    it('should select project', () => {
      act(() => {
        useAppStore.getState().setSelectedProject('my-project')
      })

      expect(useAppStore.getState().selectedProject).toBe('my-project')
    })

    it('should deselect project', () => {
      useAppStore.setState({ selectedProject: 'my-project' })

      act(() => {
        useAppStore.getState().setSelectedProject(null)
      })

      expect(useAppStore.getState().selectedProject).toBe(null)
    })
  })

  describe('flagset selection', () => {
    it('should have no flagset selected by default', () => {
      expect(useAppStore.getState().selectedFlagSet).toBe(null)
    })

    it('should select flagset', () => {
      act(() => {
        useAppStore.getState().setSelectedFlagSet('flagset-1')
      })

      expect(useAppStore.getState().selectedFlagSet).toBe('flagset-1')
    })
  })

  describe('flag updates', () => {
    it('should have empty flag updates by default', () => {
      expect(useAppStore.getState().flagUpdates).toEqual([])
    })

    it('should add flag update', () => {
      const update = {
        added: { 'new-flag': { variations: { enabled: true } } },
      }

      act(() => {
        useAppStore.getState().addFlagUpdate(update)
      })

      expect(useAppStore.getState().flagUpdates).toHaveLength(1)
      expect(useAppStore.getState().flagUpdates[0]).toEqual(update)
    })

    it('should prepend new updates', () => {
      const update1 = { added: { 'flag-1': {} } }
      const update2 = { added: { 'flag-2': {} } }

      act(() => {
        useAppStore.getState().addFlagUpdate(update1)
        useAppStore.getState().addFlagUpdate(update2)
      })

      const updates = useAppStore.getState().flagUpdates
      expect(updates).toHaveLength(2)
      expect(updates[0]).toEqual(update2) // Most recent first
      expect(updates[1]).toEqual(update1)
    })

    it('should limit flag updates to 50', () => {
      // Add 60 updates
      for (let i = 0; i < 60; i++) {
        act(() => {
          useAppStore.getState().addFlagUpdate({ added: { [`flag-${i}`]: {} } })
        })
      }

      expect(useAppStore.getState().flagUpdates).toHaveLength(50)
    })

    it('should clear flag updates', () => {
      useAppStore.setState({
        flagUpdates: [{ added: {} }, { updated: {} }],
      })

      act(() => {
        useAppStore.getState().clearFlagUpdates()
      })

      expect(useAppStore.getState().flagUpdates).toEqual([])
    })
  })
})
