import { Route, Routes } from "react-router"

import { AppShell } from "@/components/AppShell"
import { ExperimentPage } from "@/pages/ExperimentPage"
import { ExperimentsPage } from "@/pages/ExperimentsPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ExperimentsPage />} />
        <Route path="experiments/:id" element={<ExperimentPage />} />
      </Route>
    </Routes>
  )
}
