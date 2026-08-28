CREATE TABLE `list_items_next` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`media_path` text NOT NULL,
	`media_kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "list_items_kind_check" CHECK(`media_kind` IN ('image', 'video')),
	CONSTRAINT "list_items_status_check" CHECK(`status` IN ('selected', 'maybe', 'discarded'))
);
--> statement-breakpoint
INSERT INTO `list_items_next` (`id`, `list_id`, `media_path`, `media_kind`, `status`, `created_at`, `updated_at`)
SELECT `id`, `list_id`, `media_path`, `media_kind`, `status`, `created_at`, `updated_at` FROM `list_items`;
--> statement-breakpoint
DROP TABLE `list_items`;
--> statement-breakpoint
ALTER TABLE `list_items_next` RENAME TO `list_items`;
--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_list_media_unique` ON `list_items` (`list_id`,`media_path`);
--> statement-breakpoint
CREATE INDEX `list_items_list_status_idx` ON `list_items` (`list_id`,`status`);
