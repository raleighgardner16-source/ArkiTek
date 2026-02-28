import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'

const ProtectedLayout = () => {
  const currentUser = useStore((state) => state.currentUser)
  const location = useLocation()

  if (!currentUser) {
    return <Navigate to="/signin" state={{ from: location }} replace />
  }

  return <Outlet />
}

export default ProtectedLayout
