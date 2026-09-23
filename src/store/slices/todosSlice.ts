import type { AppSliceCreator } from '../types';
import type { Todo } from '../../types';
import { authFetch } from '../../lib/api';
import { getCached, setCache, invalidateCache } from '../cache';
import { getSessionEpoch, isSessionCurrent } from '../cache';

const createAuthFetch = () => authFetch;

export interface TodosSlice {
  todos: Todo[];
  fetchTodos: () => Promise<void>;
  addTodo: (todo: Partial<Todo>) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

export const createTodosSlice: AppSliceCreator<TodosSlice> = (set, get) => ({
  todos: [],

  fetchTodos: async () => {
    const epoch = getSessionEpoch();
    try {
      const cached = getCached<Todo[]>('todos');
      if (cached) {
        if (!isSessionCurrent(epoch)) return;
        set({ todos: cached });
        return;
      }
      const res = await createAuthFetch()('/api/todos');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取待办失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      setCache('todos', data);
      if (!isSessionCurrent(epoch)) return;
      set({ todos: data });
    } catch (error) {
      console.error('fetchTodos失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
  addTodo: async (todo) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todo)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建待办失败');
      }
      const newTodo = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('todos');
      set((state) => ({ todos: [newTodo, ...state.todos] }));
      get().showToast('待办创建成功', 'success');
    } catch (error) {
      console.error('addTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('创建待办失败，请稍后重试', 'error');
      throw error;
    }
  },
  toggleTodo: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/todos/${id}/toggle`, { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '切换待办状态失败');
      }
      const updatedTodo = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('todos');
      set((state) => ({ todos: state.todos.map(t => t.id === id ? updatedTodo : t) }));
    } catch (error) {
      console.error('toggleTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('切换待办状态失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteTodo: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除待办失败');
      }
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('todos');
      set((state) => ({ todos: state.todos.filter(t => t.id !== id) }));
      get().showToast('待办删除成功', 'success');
    } catch (error) {
      console.error('deleteTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('删除待办失败，请稍后重试', 'error');
      throw error;
    }
  },
});
