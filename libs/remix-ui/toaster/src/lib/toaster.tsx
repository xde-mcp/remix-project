import React, {useEffect} from 'react' // eslint-disable-line
import {Toaster as SonnerToaster, toast} from 'sonner'

import './toaster.css'

/* eslint-disable-next-line */
export interface ToasterProps {
  message: string | JSX.Element
  timeOut?: number
  handleHide?: () => void
  timestamp?: number
}

export const Toaster = (props: ToasterProps) => {
  useEffect(() => {
    if (props.message) {
      // Show toast using Sonner
      const duration = props.timeOut || 2000

      if (typeof props.message === 'string') {
        toast(props.message, {
          duration,
          onDismiss: () => {
            props.handleHide && props.handleHide()
          },
          onAutoClose: () => {
            props.handleHide && props.handleHide()
          }
        })
      } else {
        // For JSX elements, use toast.custom
        toast.custom(
          () => (
            <div className="remixui_custom_toast">
              {props.message}
            </div>
          ),
          {
            duration,
            onDismiss: () => {
              props.handleHide && props.handleHide()
            },
            onAutoClose: () => {
              props.handleHide && props.handleHide()
            }
          }
        )
      }
    }
  }, [props.message, props.timestamp])

  return (
    <SonnerToaster
      position="bottom-center"
      offset="25vh"
      toastOptions={{
        className: 'remixui_sonner_toast',
      }}
    />
  )
}

export default Toaster
