import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

interface UserStats {
  id: string;
  username: string;
  createdAt: string;
  swipes: number;
  battles: number;
  likes: number;
  passes: number;
  progress: number;
}

interface Overview {
  totalMemes: number;
  totalSwipes: number;
  totalBattles: number;
  totalUsers: number;
}

interface Meme {
  id: string;
  text: string;
  eloRating: number;
  timesShown: number;
  timesLiked: number;
}

interface AdminData {
  overview: Overview;
  users: UserStats[];
  topMemes: Meme[];
}

export default function Admin({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "users" | "memes">("overview");

  const pw = localStorage.getItem("mmm_admin_pw") || "";

  const fetchAdmin = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api(`/admin?pw=${encodeURIComponent(pw)}`);
      if (!res.ok) throw new Error("Failed to load admin data");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [pw]);

  useEffect(() => {
    fetchAdmin();
  }, [fetchAdmin]);

  const filteredUser =
    selectedUser === "all"
      ? null
      : data?.users.find((u) => u.id === selectedUser) ?? null;

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-400 mb-4">{error || "No data"}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MMM Admin
            </h1>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="all">All accounts</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Back to swipe
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {(["overview", "users", "memes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors cursor-pointer ${
                tab === t
                  ? "text-purple-400 border-b-2 border-purple-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        {tab === "overview" && (
          <OverviewTab
            overview={data.overview}
            users={data.users}
            filteredUser={filteredUser}
          />
        )}
        {tab === "users" && <UsersTab users={data.users} />}
        {tab === "memes" && <MemesTab memes={data.topMemes} />}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function OverviewTab({
  overview,
  users,
  filteredUser,
}: {
  overview: Overview;
  users: UserStats[];
  filteredUser: UserStats | null;
}) {
  if (filteredUser) {
    const likeRate =
      filteredUser.swipes > 0
        ? Math.round((filteredUser.likes / filteredUser.swipes) * 100)
        : 0;
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-200">
          {filteredUser.username}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Swipes" value={filteredUser.swipes} />
          <StatCard label="Likes" value={filteredUser.likes} />
          <StatCard label="Passes" value={filteredUser.passes} />
          <StatCard label="Like rate" value={`${likeRate}%`} />
          <StatCard label="Battles" value={filteredUser.battles} />
          <StatCard label="Progress" value={`${filteredUser.progress}%`} />
          <StatCard
            label="Joined"
            value={new Date(filteredUser.createdAt).toLocaleDateString()}
          />
        </div>
      </div>
    );
  }

  const totalLikes = users.reduce((s, u) => s + u.likes, 0);
  const globalLikeRate =
    overview.totalSwipes > 0
      ? Math.round((totalLikes / overview.totalSwipes) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total memes" value={overview.totalMemes} />
        <StatCard label="Total swipes" value={overview.totalSwipes} />
        <StatCard label="Total battles" value={overview.totalBattles} />
        <StatCard label="Users" value={overview.totalUsers} />
        <StatCard label="Total likes" value={totalLikes} />
        <StatCard label="Global like rate" value={`${globalLikeRate}%`} />
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Per-user breakdown
        </h3>
        <div className="space-y-2">
          {users.map((u) => {
            const rate =
              u.swipes > 0 ? Math.round((u.likes / u.swipes) * 100) : 0;
            return (
              <div
                key={u.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-200">{u.username}</p>
                  <p className="text-sm text-gray-500">
                    {u.swipes} swipes &middot; {u.progress}% done
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-300">
                    {u.likes} likes &middot; {u.passes} passes
                  </p>
                  <p className="text-xs text-gray-500">{rate}% like rate</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users }: { users: UserStats[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-800">
            <th className="pb-3 pr-4 font-medium">User</th>
            <th className="pb-3 pr-4 font-medium">Swipes</th>
            <th className="pb-3 pr-4 font-medium">Likes</th>
            <th className="pb-3 pr-4 font-medium">Passes</th>
            <th className="pb-3 pr-4 font-medium">Like %</th>
            <th className="pb-3 pr-4 font-medium">Battles</th>
            <th className="pb-3 pr-4 font-medium">Progress</th>
            <th className="pb-3 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const rate =
              u.swipes > 0 ? Math.round((u.likes / u.swipes) * 100) : 0;
            return (
              <tr
                key={u.id}
                className="border-b border-gray-800/50 hover:bg-gray-900/50"
              >
                <td className="py-3 pr-4 font-medium text-gray-200">
                  {u.username}
                </td>
                <td className="py-3 pr-4 text-gray-400">{u.swipes}</td>
                <td className="py-3 pr-4 text-green-400">{u.likes}</td>
                <td className="py-3 pr-4 text-red-400">{u.passes}</td>
                <td className="py-3 pr-4 text-gray-300">{rate}%</td>
                <td className="py-3 pr-4 text-gray-400">{u.battles}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden max-w-20">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${u.progress}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-xs">
                      {u.progress}%
                    </span>
                  </div>
                </td>
                <td className="py-3 text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MemesTab({ memes }: { memes: Meme[] }) {
  return (
    <div className="space-y-2">
      {memes.map((meme, i) => {
        const likeRate =
          meme.timesShown > 0
            ? Math.round((meme.timesLiked / meme.timesShown) * 100)
            : 0;
        return (
          <div
            key={meme.id}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4"
          >
            <div className="shrink-0 w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-200 mb-2 break-words">{meme.text}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  ELO:{" "}
                  <span className="text-gray-300">
                    {Math.round(meme.eloRating)}
                  </span>
                </span>
                <span>
                  Shown:{" "}
                  <span className="text-gray-300">{meme.timesShown}</span>
                </span>
                <span>
                  Liked:{" "}
                  <span className="text-green-400">{meme.timesLiked}</span>
                </span>
                <span>
                  Like rate: <span className="text-gray-300">{likeRate}%</span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
