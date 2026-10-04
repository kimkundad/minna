<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\CreatesNewUsers;
use Laravel\Jetstream\Jetstream;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        $input['phone'] = preg_replace('/\D+/', '', (string) ($input['phone'] ?? ''));
        $input['phone_code'] = preg_replace('/[^0-9+]/', '', (string) ($input['phone_code'] ?? '+66'));

        $input['birthdate'] = $this->normalizeBirthdate(
            $input['birthdate'] ?? $input['birthdate_display'] ?? null
        );

        Validator::make($input, [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'birthdate' => ['required', 'date'],
            'phone_code' => ['required', 'string', 'max:5'],
            'phone' => ['required', 'digits_between:8,15'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email', 'confirmed'],
            'password' => $this->passwordRules(),
            'g-recaptcha-response' => ['required', 'string'],
            'terms' => Jetstream::hasTermsAndPrivacyPolicyFeature() ? ['accepted', 'required'] : ['nullable'],
        ])->validate();

        $this->validateRecaptcha($input['g-recaptcha-response']);

        $fullName = trim($input['first_name'].' '.$input['last_name']);

        $user = User::create([
            'username' => $this->generateUniqueUsername($input['email'], $fullName),
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'name' => $fullName,
            'birthdate' => $input['birthdate'],
            'phone_country_code' => $input['phone_code'],
            'phone_national' => $input['phone'],
            'phone' => $input['phone_code'].$input['phone'],
            'email' => $input['email'],
            'password' => Hash::make($input['password']),
        ]);

        $user->assignRole('student');

        return $user;
    }

    private function generateUniqueUsername(string $email, string $name): string
    {
        $emailPrefix = Str::before($email, '@');
        $slugFromName = Str::slug($name, '');
        $base = strtolower($emailPrefix ?: $slugFromName ?: 'student');
        $base = preg_replace('/[^a-z0-9_]/', '', $base) ?: 'student';
        $base = Str::limit($base, 40, '');

        $username = $base;
        $counter = 1;

        while (User::query()->where('username', $username)->exists()) {
            $username = Str::limit($base, 36, '').$counter;
            $counter++;
        }

        return $username;
    }

    private function validateRecaptcha(string $token): void
    {
        $secretKey = (string) config('services.recaptcha.secret_key');

        if ($secretKey === '') {
            throw ValidationException::withMessages([
                'email' => 'ยังไม่ได้ตั้งค่า RECAPTCHA_SECRET_KEY',
            ]);
        }

        $response = Http::asForm()->post('https://www.google.com/recaptcha/api/siteverify', [
            'secret' => $secretKey,
            'response' => $token,
        ])->json();

        $isSuccess = (bool) data_get($response, 'success', false);

        if (! $isSuccess) {
            throw ValidationException::withMessages([
                'email' => 'reCAPTCHA ไม่ผ่านการตรวจสอบ กรุณาลองใหม่อีกครั้ง',
            ]);
        }
    }

    private function normalizeBirthdate(?string $birthdate): ?string
    {
        if (empty($birthdate)) {
            return null;
        }

        $birthdate = trim($birthdate);

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthdate)) {
            return $birthdate;
        }

        if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $birthdate, $matches)) {
            $day = (int) $matches[1];
            $month = (int) $matches[2];
            $year = (int) $matches[3];
            $gregorianYear = $year > 2400 ? $year - 543 : $year;

            try {
                $date = Carbon::createFromFormat('!Y-n-j', $gregorianYear.'-'.$month.'-'.$day);

                if ((int) $date->format('Y') !== $gregorianYear ||
                    (int) $date->format('n') !== $month ||
                    (int) $date->format('j') !== $day) {
                    return $birthdate;
                }

                return $date->format('Y-m-d');
            } catch (\Throwable $e) {
                return $birthdate;
            }
        }

        return $birthdate;
    }
}
