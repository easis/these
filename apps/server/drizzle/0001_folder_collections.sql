CREATE TABLE `folder_collections` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `name_key` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_collections_name_key_unique` ON `folder_collections` (`name_key`);
--> statement-breakpoint
CREATE TABLE `folder_collection_items` (
  `collection_id` integer NOT NULL,
  `folder_path` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`collection_id`) REFERENCES `folder_collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_collection_items_collection_path_unique` ON `folder_collection_items` (`collection_id`,`folder_path`);
--> statement-breakpoint
CREATE INDEX `folder_collection_items_path_idx` ON `folder_collection_items` (`folder_path`);
