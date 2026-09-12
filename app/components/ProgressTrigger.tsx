'use client';

import { useNProgress } from '../hooks/useNProgress';
import { ReactElement, cloneElement, MouseEvent } from 'react';

interface ProgressTriggerProps {
  children: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
  immediate?: boolean; // 是否立即顯示進度條
  duration?: number; // 進度條顯示持續時間（毫秒）
}

const ProgressTrigger = ({ 
  children, 
  immediate = true, 
  duration = 1000 
}: ProgressTriggerProps) => {
  const { start, done } = useNProgress();

  const handleClick = (event: MouseEvent) => {
    if (immediate) {
      start();
      
      // 如果有設定持續時間，自動完成進度條
      if (duration > 0) {
        setTimeout(() => {
          done();
        }, duration);
      }
    }
    
    // 執行原本的 onClick 事件
    if (children.props.onClick) {
      children.props.onClick(event);
    }
  };

  // 克隆子元素並添加 onClick 處理器
  return cloneElement(children, {
    onClick: handleClick,
  });
};

export default ProgressTrigger;
