// Мемоізований derive: перераховуємо лише коли змінилися дані (state.v).
import { state } from './store.js';
import { derive } from './model.js';

let memo = { v: -1, d: null };
export function getDerived() {
  if (memo.v !== state.v) memo = { v: state.v, d: derive(state.data) };
  return memo.d;
}
