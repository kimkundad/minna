<?php

namespace App\Providers;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        View::composer(['partials.header', 'partials.footer'], function ($view) {
            $defaults = [
                'contact_phone' => '(970) 262-1413',
                'contact_email' => 'address@gmail.com',
                'facebook_url' => '#',
                'twitter_url' => '#',
                'skype_url' => '#',
                'instagram_url' => '#',
            ];

            if (! Schema::hasTable('site_settings')) {
                $view->with('siteSettings', $defaults);
                return;
            }

            $settings = SiteSetting::query()->pluck('value', 'key')->toArray();
            $view->with('siteSettings', array_merge($defaults, $settings));
        });

        if (config('app.env') !== 'local') { // ใช้เฉพาะ production หรือ staging
            URL::forceScheme('https');
        }
    }
}
