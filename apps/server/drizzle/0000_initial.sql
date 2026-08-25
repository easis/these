CREATE TABLE `folder_metadata` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `path` text NOT NULL,
  `alias` text,
  `favorite` integer DEFAULT false NOT NULL,
  `hidden` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_metadata_path_unique` ON `folder_metadata` (`path`);
--> statement-breakpoint
CREATE INDEX `folder_metadata_favorite_idx` ON `folder_metadata` (`favorite`);
--> statement-breakpoint
CREATE INDEX `folder_metadata_hidden_idx` ON `folder_metadata` (`hidden`);
--> statement-breakpoint
CREATE TABLE `lists` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `list_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `list_id` integer NOT NULL,
  `media_path` text NOT NULL,
  `media_kind` text NOT NULL CHECK (`media_kind` IN ('image', 'video')),
  `status` text NOT NULL CHECK (`status` IN ('selected', 'maybe')),
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_list_media_unique` ON `list_items` (`list_id`,`media_path`);
--> statement-breakpoint
CREATE INDEX `list_items_list_status_idx` ON `list_items` (`list_id`,`status`);
--> statement-breakpoint
CREATE TABLE `settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
