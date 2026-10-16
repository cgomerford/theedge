'use client'
import { createContext } from 'react'
import type { PhotoMap } from '../headshot'

/** playerId → data URL (loaded), null (failed → initials), undefined (not loaded yet → initials). */
export const PhotoContext = createContext<PhotoMap>({})
