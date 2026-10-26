import { useContext } from 'react'
import { TourContext } from '../context/tour.js'

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour debe usarse dentro de un TourProvider')
  }
  return context
}
