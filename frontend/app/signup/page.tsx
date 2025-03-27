'use client'; // This component needs client-side interactivity

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { createClient } from '@/lib/supabaseClient'; // Import Supabase client utility
import Image from 'next/image'; // Import the Image component

export default function SignUp() {
  const router = useRouter(); // Initialize router
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient(); // Initialize client

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    // console.log('Attempting sign up with:', { name, email }); // Placeholder removed

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            // You can add additional user metadata here if needed
            // For Supabase Auth, 'name' isn't a default field,
            // but you might store it in a separate 'profiles' table later.
            // We'll keep it simple for now.
          },
          // Enable email confirmation if desired in Supabase project settings
          // emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // Handle success - show message to check email
      console.log('Sign up initiated:', data);
      setMessage('Sign up successful! Please check your email to confirm your account.');
      // Clear form or redirect as needed after showing message
      setName('');
      setEmail('');
      setPassword('');

    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        {/* Actual Logo */}
        <div className="flex justify-center mb-6">
            <Image src="/plural_logo.png" alt="Plural Logo" width={250} height={50} priority /> {/* Adjust width/height as needed */}
        </div>
         <h1 className="text-xl text-center text-gray-700 mb-6">
          Create your Account
        </h1>
         {/* End Logo Placeholder */}
        <form className="space-y-6" onSubmit={handleSignUp}>
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Your Name"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6} // Supabase default minimum password length
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Password (min. 6 characters)"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {message && (
            <p className="text-sm text-green-600">{message}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </div>
        </form>
         <p className="mt-4 text-sm text-center text-gray-600">
          Already have an account?{' '}
          <a href="/signin" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign In
          </a>
        </p>
      </div>
    </div>
  );
}