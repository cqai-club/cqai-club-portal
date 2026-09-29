'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import NProgress from 'nprogress';

// 配置 NProgress
if (typeof window !== 'undefined') {
  NProgress.configure({
    showSpinner: false, 
    speed: 400, 
    minimum: 0.2,
    trickleSpeed: 200, 
  });
}

const LoadingBar = () => {
  const pathname = usePathname();

  useEffect(() => {
    // 路由变化时显示进度条
    const timer = setTimeout(() => {
      NProgress.done();
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [pathname]);

  useEffect(() => {
    // 只为会切换页面的站内链接启动进度条；本页操作不会触发路由完成回调。
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

      const href = link.getAttribute('href');
      if (!href?.startsWith('/') || href.startsWith('//')) return;

      if (new URL(href, window.location.origin).pathname !== pathname) {
        NProgress.start();
      }
    };

    const handleBeforeUnload = () => {
      NProgress.start();
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pathname]);

  return null;
};

export default LoadingBar;
