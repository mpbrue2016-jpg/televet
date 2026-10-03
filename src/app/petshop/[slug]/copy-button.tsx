"use client"

import { useState } from "react"

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text", err)
    }
  }

  return (
    <button 
      onClick={handleCopy}
      className="bg-white/10 hover:bg-white/20 text-white border-none py-2.5 px-4 rounded-lg font-semibold cursor-pointer transition-colors"
    >
      {copied ? "✓" : "Copiar"}
    </button>
  )
}
