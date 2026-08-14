"use client";

import AdminNavGroup from "./AdminNavGroup";
import { ADMIN_NAV_GROUPS } from "./adminNavData";

export default function ProjectsNavGroup(props) {
  return <AdminNavGroup group={ADMIN_NAV_GROUPS[2]} {...props} />;
}
