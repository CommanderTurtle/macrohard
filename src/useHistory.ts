import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
export function useHistory<T>(initial:T) {
  const [history,set]=useState({value:initial,past:[] as T[],future:[] as T[]});
  const change:Dispatch<SetStateAction<T>>=useCallback(update=>set(h=>{
    const value=typeof update==='function'?(update as (prev:T)=>T)(h.value):update;
    return value===h.value?h:{value,past:[...h.past,h.value].slice(-50),future:[]};
  }),[]);
  const undo=useCallback(()=>set(h=>!h.past.length?h:{value:h.past.at(-1)!,past:h.past.slice(0,-1),future:[h.value,...h.future]}),[]);
  const redo=useCallback(()=>set(h=>!h.future.length?h:{value:h.future[0],past:[...h.past,h.value],future:h.future.slice(1)}),[]);
  return {value:history.value,change,undo,redo,canUndo:!!history.past.length,canRedo:!!history.future.length};
}
