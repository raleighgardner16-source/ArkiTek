import { useState, useEffect, useRef, useCallback } from 'react'

export function useScrollManagement({
  chatAreaRef,
  responseAreaRef,
  showCouncilColumns,
  hasActiveConversation,
  inlineResponseText,
  lastSubmittedPrompt,
  summaryConvoLength,
  singleModelConvoLength,
}) {
  const [councilGutterHover, setCouncilGutterHover] = useState(null)
  const leftGutterRef = useRef(null)
  const rightGutterRef = useRef(null)

  const prevConvoLengthRef = useRef(0)
  const prevSingleConvoLengthRef = useRef(0)
  const lastScrolledPromptRef = useRef(null)

  const handleCouncilGutterWheel = useCallback((e) => {
    e.preventDefault()
    const columns = document.querySelectorAll('.council-column-scroll')
    columns.forEach(col => { col.scrollTop += e.deltaY })
  }, [])

  // Attach wheel listeners to left/right gutter elements
  useEffect(() => {
    if (!showCouncilColumns) return
    const left = leftGutterRef.current
    const right = rightGutterRef.current
    const opts = { passive: false }
    if (left) left.addEventListener('wheel', handleCouncilGutterWheel, opts)
    if (right) right.addEventListener('wheel', handleCouncilGutterWheel, opts)
    return () => {
      if (left) left.removeEventListener('wheel', handleCouncilGutterWheel, opts)
      if (right) right.removeEventListener('wheel', handleCouncilGutterWheel, opts)
    }
  }, [showCouncilColumns, handleCouncilGutterWheel])

  // Lock page-level scrolling while council columns are visible
  useEffect(() => {
    if (!showCouncilColumns) return

    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [showCouncilColumns])

  // Scroll to show the response when it first appears (after a new prompt)
  useEffect(() => {
    if (!hasActiveConversation || !inlineResponseText || !chatAreaRef.current) return
    if (lastScrolledPromptRef.current === lastSubmittedPrompt) return
    lastScrolledPromptRef.current = lastSubmittedPrompt
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (responseAreaRef.current && chatAreaRef.current) {
          const containerRect = chatAreaRef.current.getBoundingClientRect()
          const responseRect = responseAreaRef.current.getBoundingClientRect()
          const responseTopInContainer = responseRect.top - containerRect.top + chatAreaRef.current.scrollTop
          const scrollTarget = Math.max(0, responseTopInContainer - 120)
          chatAreaRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' })
        }
      }, 100)
    })
  }, [hasActiveConversation, inlineResponseText, lastSubmittedPrompt, chatAreaRef, responseAreaRef])

  // Scroll to bottom when a follow-up conversation message is added
  useEffect(() => {
    if ((summaryConvoLength > prevConvoLengthRef.current && summaryConvoLength > 0) ||
        (singleModelConvoLength > prevSingleConvoLengthRef.current && singleModelConvoLength > 0)) {
      setTimeout(() => {
        if (chatAreaRef.current) {
          chatAreaRef.current.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' })
        }
      }, 150)
    }

    prevConvoLengthRef.current = summaryConvoLength
    prevSingleConvoLengthRef.current = singleModelConvoLength
  }, [summaryConvoLength, singleModelConvoLength, chatAreaRef])

  return {
    councilGutterHover,
    setCouncilGutterHover,
    leftGutterRef,
    rightGutterRef,
  }
}
