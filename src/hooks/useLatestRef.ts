import { useRef } from 'react'

/**
 * 保存最新值的 ref —— 让事件处理器/订阅闭包读到最新状态而无需重建身份。
 * （此前项目里混用三种写法：useEffect 同步、渲染期赋值、以及遗漏同步导致的
 *  stale closure。）
 */
export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
