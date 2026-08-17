CREATE TABLE `shared_renders` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
