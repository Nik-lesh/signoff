import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, useToast, type ButtonProps } from '@/components/ui'

interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  /** The text to put on the clipboard. */
  text: string
  /** Button label, e.g. "Copy command". */
  label: string
  /** Toast shown after copying, e.g. "Command copied". */
  copied: string
}

export function CopyButton({ text, label, copied, variant = 'outline', size = 'sm', ...props }: CopyButtonProps) {
  const toast = useToast()
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      toast.success(copied)
      window.setTimeout(() => setDone(false), 1800)
    } catch {
      toast.error('Could not copy', 'Select the text and copy it by hand.')
    }
  }

  return (
    <Button variant={variant} size={size} onClick={copy} {...props}>
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {label}
    </Button>
  )
}
