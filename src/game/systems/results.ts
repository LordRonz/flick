import type { MatchStanding } from "../types";

type UnrankedStanding = Omit<MatchStanding, "rank">;

export type RoundAward = {
	playerId: string;
	playerNumber: MatchStanding["playerNumber"];
	color: MatchStanding["color"];
	label: "SHARPSHOOTER" | "TRICK SHOT" | "BOSS HUNTER" | "WRECKING CREW";
	detail: string;
};

export function successfulThrowRate(
	standing: Pick<MatchStanding, "throws" | "successfulThrows">,
) {
	if (standing.throws <= 0) return 0;
	return Math.min(1, standing.successfulThrows / standing.throws);
}

export function rankStandings(players: readonly UnrankedStanding[]) {
	let previousScore: number | undefined;
	let previousRank = 0;
	return [...players]
		.sort((a, b) => b.score - a.score || a.playerNumber - b.playerNumber)
		.map((player, index): MatchStanding => {
			const rank = player.score === previousScore ? previousRank : index + 1;
			previousScore = player.score;
			previousRank = rank;
			return { ...player, rank };
		});
}

export function buildRoundAwards(standings: readonly MatchStanding[]) {
	const candidateGroups: RoundAward[][] = [
		winnersFor(
			standings.filter(
				(standing) =>
					standing.throws >= 3 && successfulThrowRate(standing) >= 0.5,
			),
			(standing) => successfulThrowRate(standing),
			"SHARPSHOOTER",
			(standing) =>
				`${Math.round(successfulThrowRate(standing) * 100)}% of throws connected`,
		),
		winnersFor(
			standings,
			(standing) => standing.bankShots,
			"TRICK SHOT",
			(standing) =>
				`${standing.bankShots} bank shot${standing.bankShots === 1 ? "" : "s"}`,
		),
		winnersFor(
			standings,
			(standing) => standing.leaderHits,
			"BOSS HUNTER",
			(standing) =>
				`${standing.leaderHits} leader hit${standing.leaderHits === 1 ? "" : "s"}`,
		),
		winnersFor(
			standings,
			(standing) => standing.propHits,
			"WRECKING CREW",
			(standing) =>
				`${standing.propHits} prop hit${standing.propHits === 1 ? "" : "s"}`,
		),
	];
	const awardedPlayers = new Set<string>();
	const awards: RoundAward[] = [];
	for (const group of candidateGroups) {
		const available = group.filter(
			(candidate) => !awardedPlayers.has(candidate.playerId),
		);
		if (awards.length + available.length > 3) continue;
		for (const candidate of available) {
			awardedPlayers.add(candidate.playerId);
			awards.push(candidate);
		}
	}
	return awards;
}

function winnersFor(
	standings: readonly MatchStanding[],
	value: (standing: MatchStanding) => number,
	label: RoundAward["label"],
	detail: (standing: MatchStanding) => string,
) {
	const ranked = [...standings].sort(
		(a, b) => value(b) - value(a) || a.playerNumber - b.playerNumber,
	);
	const winner = ranked[0];
	if (!winner || value(winner) <= 0) return [];
	const winningValue = value(winner);
	return ranked
		.filter((standing) => value(standing) === winningValue)
		.map(
			(standing) =>
				({
					playerId: standing.playerId,
					playerNumber: standing.playerNumber,
					color: standing.color,
					label,
					detail: detail(standing),
				}) satisfies RoundAward,
		);
}
