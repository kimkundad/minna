<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE `course_orders` MODIFY `qp_id` VARCHAR(191) NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `res_code` VARCHAR(64) NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `res_desc` TEXT NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `payment_url` TEXT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE `course_orders` MODIFY `qp_id` VARCHAR(64) NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `res_code` VARCHAR(20) NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `res_desc` VARCHAR(255) NULL");
        DB::statement("ALTER TABLE `course_orders` MODIFY `payment_url` VARCHAR(255) NULL");
    }
};
