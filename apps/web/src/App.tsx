import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { BrowsePage } from "./pages/BrowsePage";
import { CollectionPage } from "./pages/CollectionPage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { FolderManagerPage } from "./pages/FolderManagerPage";
import { HomePage } from "./pages/HomePage";
import { ListPage } from "./pages/ListPage";
import { ListsPage } from "./pages/ListsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionPage />} />
        <Route path="lists" element={<ListsPage />} />
        <Route path="lists/:id" element={<ListPage />} />
        <Route path="folders" element={<FolderManagerPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
