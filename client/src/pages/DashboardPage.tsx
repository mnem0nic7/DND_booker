import { useAuthStore } from '../stores/authStore';

export default function DashboardPage() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">DND Booker</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.displayName}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Projects</h2>
        <p className="text-gray-500">No projects yet. Create your first one!</p>
      </main>
    </div>
  );
}
