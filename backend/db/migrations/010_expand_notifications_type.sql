-- Migration: 010_expand_notifications_type.sql
-- Allow topic_request, topic_approved, topic_rejected, and custom notification types

ALTER TABLE `notifications` MODIFY COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'general';
