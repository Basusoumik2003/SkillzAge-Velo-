export const ADMIN_NAV_GROUPS = [
  {
    key: "dashboard",
    title: "Dashboard",
    items: [
      { key: "overview", label: "Overview", description: "Platform health and revenue snapshot" }
    ]
  },
  {
    key: "identity_access",
    title: "Identity & Access",
    items: [
      { key: "admin_access", label: "Admin Access", description: "Edit admin credentials and access" },
      { key: "user_management", label: "User Management", description: "View, search, and manage users" },
      { key: "certificate_requests", label: "Certificate Requests", description: "Review and issue certificates" }
    ]
  },
  {
    key: "projects",
    title: "Projects",
    items: [
      { key: "project_usage", label: "Project Usage", description: "Usage and activity by project" },
      { key: "project_create", label: "Create Project", description: "Create a new project template" },
      { key: "project_catalog", label: "Project Catalog", description: "Browse and edit catalog projects" },
      { key: "companies", label: "Companies", description: "Manage tenant/company records" },
      { key: "project_documents", label: "Project Documents", description: "Manage project-specific documents" },
      { key: "global_documents", label: "Global Documents", description: "Shared documents across the platform" },
      { key: "demo_documents", label: "Demo Documents", description: "Manage sample and trial docs" },
      { key: "assign_manual", label: "Manual Assign", description: "Assign projects to users manually" },
      { key: "assign_requests", label: "Assignment Requests", description: "Review pending assignment requests" },
      { key: "assigned_projects", label: "Assigned Projects", description: "Inspect assigned project records" }
    ]
  },
  {
    key: "knowledge_base",
    title: "Knowledge Base",
    items: [
      { key: "mentors", label: "Mentors", description: "Create and manage mentor profiles" },
      { key: "mentor_chat_rules", label: "Mentor Chat Rules", description: "Tune mentor responses and behaviour" },
      { key: "recommendations", label: "Recommendations", description: "Review recommendation logs" }
    ]
  },
  {
    key: "ai_rag",
    title: "AI RAG",
    items: [
      { key: "token_management", label: "Token Management", description: "Inspect model token usage" },
      { key: "rag_monitoring", label: "RAG Monitoring", description: "Observe retrieval activity" },
      { key: "stage_document_reviews", label: "Document Reviews", description: "Document review pipeline metrics" }
    ]
  },
  {
    key: "media_website",
    title: "Media & Website",
    items: [
      { key: "testimonials", label: "Testimonials", description: "Edit homepage testimonials" },
      { key: "home_certificates", label: "Home Certificates", description: "Manage certificate highlights" },
      { key: "category_icons", label: "Category Icons", description: "Upload category icon assets" },
      { key: "contact_messages", label: "Contact Messages", description: "Read inbound contact submissions" },
      { key: "newsletters", label: "Newsletters", description: "Draft and send newsletters" },
      { key: "video_analytics", label: "Video Analytics", description: "Track media evaluation stats" }
    ]
  },
  {
    key: "platform_settings",
    title: "Platform Settings",
    items: [
      { key: "coin_pricing", label: "Coin Pricing", description: "Configure pricing and discounts" },
      { key: "github_settings", label: "GitHub Settings", description: "Manage GitHub token and webhook" },
      { key: "s3_cleanup", label: "S3 Cleanup", description: "Inspect and delete stored objects" },
      { key: "theme_management", label: "Theme Management", description: "Edit banners, decorations, and themes" }
    ]
  }
];
