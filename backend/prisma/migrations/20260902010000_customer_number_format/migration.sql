-- Introduce a durable, concurrency-safe source for Customer numbers.
CREATE TABLE `customer_number_sequences` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reserve one sequence value for every existing Customer. This keeps the next
-- generated number above all values assigned during the backfill.
INSERT INTO `customer_number_sequences` (`created_at`)
SELECT `created_at` FROM `customers` ORDER BY `created_at`, `id`;

-- Move current values out of the target namespace first so the existing unique
-- index cannot collide while rows are assigned their new SW######## number.
UPDATE `customers`
SET `customer_no` = CONCAT('TMP-', `id`);

UPDATE `customers` AS `customer`
JOIN (
    SELECT `ranked`.`id`, `ranked`.`sequence_no`
    FROM (
        SELECT `id`, ROW_NUMBER() OVER (ORDER BY `created_at`, `id`) AS `sequence_no`
        FROM `customers`
    ) AS `ranked`
) AS `numbered` ON `numbered`.`id` = `customer`.`id`
SET `customer`.`customer_no` = CONCAT('SW', LPAD(`numbered`.`sequence_no`, 8, '0'));
