"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast 컨테이너 — 모바일: 하단 중앙, 데스크톱: 우하단 */}
      <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[100] flex flex-col gap-2 sm:max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <SingleToast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const ICON = {
  success: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />,
  error: <XCircle className="w-4 h-4 text-red-500 shrink-0" />,
  info: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
};

const BG = {
  success: "bg-green-50 border-green-100",
  error: "bg-red-50 border-red-100",
  info: "bg-white border-gray-100",
};

function SingleToast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg
        ${BG[item.type]} animate-in slide-in-from-bottom-2 duration-300`}
    >
      {ICON[item.type]}
      <p className="text-sm text-gray-700 flex-1 leading-relaxed">
        {item.message}
      </p>
      <button
        onClick={onDismiss}
        className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
