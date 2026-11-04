\documentclass[10pt,twocolumn,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{newtxtext,newtxmath}\renewcommand{\ttdefault}{lmtt}
\usepackage[margin=17mm,top=20mm,bottom=20mm,columnsep=7mm]{geometry}
\usepackage[protrusion=true,expansion=true]{microtype}
\usepackage{booktabs,graphicx,xcolor,enumitem,caption,titlesec,fancyhdr,lastpage,array,tabularx,amsmath}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning,calc,fit}
\usepackage[hyphens]{url}\Urlmuskip=0mu plus 2mu
\usepackage[authoryear,round,sort&compress]{natbib}
\usepackage[colorlinks=true,linkcolor=sigred,citecolor=coolblue,urlcolor=coolblue,pdfborder={0 0 0},
  pdftitle={@@pdftitle@@},pdfauthor={Poon Thiengburanathum; Non Arkaraprasertkul},
  pdfkeywords={smart city; digital government; Thailand; early warning; open data; digital twin; inter-agency coordination}]{hyperref}

\definecolor{ink}{HTML}{1B1F23}\definecolor{sigred}{HTML}{B4231A}\definecolor{coolblue}{HTML}{1E4E79}
\definecolor{mid}{HTML}{6B7280}\definecolor{rule}{HTML}{D4D7DC}
\renewcommand{\topfraction}{0.9}\renewcommand{\bottomfraction}{0.6}\renewcommand{\textfraction}{0.08}\renewcommand{\floatpagefraction}{0.75}\renewcommand{\dblfloatpagefraction}{0.75}\renewcommand{\dbltopfraction}{0.9}
\setlength{\parindent}{0.9em}\setlength{\parskip}{0pt}\linespread{1.04}
\setlist{nosep,leftmargin=1.3em,itemsep=1.5pt}
\captionsetup{font={small},labelfont={bf,color=sigred},labelsep=period,justification=raggedright,singlelinecheck=false,skip=3pt}
\titleformat{\section}{\large\bfseries\color{ink}}{\thesection}{0.6em}{}
\titleformat{\subsection}{\normalsize\bfseries\color{ink}}{\thesubsection}{0.6em}{}
\titlespacing*{\section}{0pt}{11pt}{4pt}\titlespacing*{\subsection}{0pt}{7pt}{2pt}
\pagestyle{fancy}\fancyhf{}\renewcommand{\headrulewidth}{0.3pt}\renewcommand{\headrule}{\hbox to\headwidth{\color{rule}\leaders\hrule height \headrulewidth\hfill}}
\fancyhead[L]{\small\color{mid}Preprint --- not peer reviewed}\fancyhead[R]{\small\color{mid}Thiengburanathum \& Arkaraprasertkul}
\setlength{\headheight}{14pt}
\fancyfoot[C]{\small\color{mid}\thepage\,/\,\pageref{LastPage}}
\fancypagestyle{first}{\fancyhf{}\renewcommand{\headrulewidth}{0pt}\fancyhead[L]{\small\color{mid}Preprint --- not peer reviewed \quad|\quad @@version@@}\fancyfoot[C]{\small\color{mid}\thepage\,/\,\pageref{LastPage}}}
\newcommand{\kw}[1]{\textbf{#1}}
\newcommand{\hyp}[1]{\textbf{\color{sigred}#1}}
\renewcommand{\arraystretch}{1.12}

\begin{document}
\twocolumn[{%
\thispagestyle{first}
\begin{center}
{\color{mid}\small\textsc{Preprint \,·\, Public-policy and urban-systems research}}\\[7pt]
{\LARGE\bfseries\color{ink} @@title@@\par}
\vspace{7pt}
{\large Poon Thiengburanathum$^{1,2}$ \quad and \quad Non Arkaraprasertkul$^{3}$}\\[3pt]
{\small $^{1}$Faculty of Engineering, Chiang Mai University, Thailand\\
$^{2}$Research and Innovation Acceleration Agency for Competitiveness and Area Development (RCAD), Thailand\\
$^{3}$Digital Economy Promotion Agency of Thailand (depa)}\\[2pt]
{\small\color{mid}Correspondence: \href{https://cnx.nonarkara.org/cnx/research}{cnx.nonarkara.org/cnx/research} \,·\, Preprint of @@date@@ \,·\, Version @@version@@}
\end{center}
\vspace{2pt}
\begin{center}\begin{minipage}{0.92\textwidth}\small
\textbf{Abstract.}\; @@abstract@@\\[4pt]
\textbf{Keywords:} smart city; digital government; Thailand; early warning; open data; digital twin; inter-agency coordination; procurement.
\end{minipage}\end{center}
\vspace{4pt}\hrule height 0.4pt\vspace{8pt}
}]

\section{A gauge, a river, and a calm screen}
On 5 October 2026 a rain gauge in Chom Thong recorded 94.5\,mm in twenty-four hours: ``very heavy'' rain on the Thai Meteorological Department's scale, on a hill catchment. The screen that day, the second author's own operations room (CNX, version 1.7), read river gauges only and showed no sign of high water. Both measurements were true. Both were public, and both came through the same national water-data portal. Nothing on our screen connected them until we added rain gauges that day (repository commit \texttt{c2a44ff}; the Chom Thong reading is the fixture in \texttt{rain-core.test.ts}). We start with our own failure because it is the failure this paper is about.

It is not a failure of sensors. Thailand has rain gauges, satellites, a national meteorological service that publishes its warnings as machine-readable CAP messages \citep{tmd2026cap}, and a provincial office that has written down 177 places where flood evacuees may sleep. It is a failure of \emph{the chain}: the steps between a measurement and a person who moves. Each link is published, if at all, by a different body, in a different form.

Thailand has promoted smart cities and digital government for a decade. The United Nations e-government index places it 52nd of 193 in 2024, up from 55th in 2022, while its e-participation rank fell from 18th to 42nd over the same two years \citep{undesa2024egov}. Studies find a smart-city strategy with no province-level implementation plan \citep{naprathansuk2017} and, in Phuket, progress in only some dimensions with budget the main obstacle \citep{jamnong2022phuket}. The pattern is familiar from critiques of smart cities elsewhere \citep{hollands2008,soderstrom2014,shelton2015}.

\paragraph{Research question.} \emph{Can a working chain from measurement to warning to shelter be assembled from public sources alone, without waiting for inter-agency agreement --- and what do the points where it cannot be assembled show about why the chain stays open?}

\paragraph{Four candidate gaps.} Practitioners offer four explanations. We treat each as a hypothesis, state what we could and could not measure for it, and report descriptively:
\begin{itemize}
\item \hyp{H1 Coordination.} Agencies publish in isolation; nothing joins their records.
\item \hyp{H2 Procurement.} Technology is bought as files and projects, not as open, maintained services.
\item \hyp{H3 Responsiveness.} Published data records the past; it does not drive a response.
\item \hyp{H4 End-to-end.} No monitoring-to-push chain exists, e.g.\ rain to drainage, haze to shelter.
\end{itemize}
\paragraph{What this paper is, and is not.} It is an audit of what one province's open data \emph{publishes}, plus a feasibility study of a system built to close the chain. It does not observe procurement, agency behaviour or warning outcomes directly, and it does not test the hypotheses; Section~\ref{sec:limits} says what would.
\paragraph{Contributions.} (i) A descriptive audit of one province's open-data estate (@@estate_datasets@@ datasets, @@estate_resources@@ resources, @@estate_orgs@@ publishers) against the four gaps. (ii) A link-by-link audit of two hazard chains. (iii) A working system and its operating record, with an account of what it could not bypass. (iv) Open data and code to repeat every number.

\section{Background}
\paragraph{Smart cities and the delivery gap.}
Critics describe the smart city as an idea that sells faster than it ships \citep{hollands2008,townsend2013smart,greenfield2013against}: corporate storytelling \citep{soderstrom2014,wiig2015}, top-down programmes that skip the citizen \citep{datta2015,cardullo2019}, and a gap between rhetoric and the ``actually existing'' city \citep{shelton2015}. The label travels as a global discourse \citep{joss2019}. For Thailand, recent work identifies the core data sets that smart-city governance needs across 36 cities \citep{ruangwicha2026}.

\paragraph{Coordination and procurement.}
Joined-up government is easy to want and hard to build \citep{pollitt2003,bardach1998}; the literature lists conditions for collaboration \citep{bryson2006,ansell2008}, network forms \citep{provan2008} and whole-of-government reform \citep{christensen2007}. Public IT fails often \citep{goldfinch2007,anthopoulos2016}; project cost and design-reality gaps are recurring causes \citep{flyvbjerg2013,heeks2006}; demand-side procurement can drive innovation \citep{edler2007}; and digital-service teams offer an alternative delivery model \citep{mergel2019,pahlka2023}. Thailand's procurement act was enacted in 2017 \citep{thailand2017procurementact}; the Digital Government Act concerns digital administration and service delivery \citep{thailand2019digitalact}.

\paragraph{Responsive data.}
Open data has documented benefits, barriers and myths \citep{janssen2012open}; its quality can be measured along dimensions such as currency and accessibility \citep{vetro2016,zaveri2016}, and the FAIR principles say what a dataset must offer a machine \citep{wilkinson2016}. A city digital twin adds the demand that a model stay synchronised with what it models \citep{batty2018,bolton2018gemini}.

\paragraph{Early warning.}
An early-warning system has four elements: knowing the risk, detecting and forecasting, communicating, and preparing to respond \citep{wmo2018mhews}; the field has long treated it as a people-centred system rather than a technology \citep{basher2006,sorensen2000}. The Sendai Framework and Early Warnings for All make it a global target \citep{unga2015sendai,wmo2023ew4all}, and the Common Alerting Protocol is the open format that carries a warning between systems \citep{oasis2010cap}. Thailand's 2011 floods caused THB\,1.43 trillion in damage and losses and affected over 13 million people; the World Bank's assessment recommended early warning built on high-quality real-time data \citep{worldbank2012thaiflood}.

\paragraph{Haze.}
In Chiang Mai the other seasonal hazard is smoke \citep{chantara2012,inlaung2022}. Satellite fire detection runs at 375\,m \citep{schroeder2014}; the World Health Organization's 2021 guideline for 24-hour PM$_{2.5}$ is 15\,\textmu g/m$^3$, with interim targets down from 75 \citep{who2021aqg}; a regional treaty has required monitoring since 2002 \citep{asean2002haze}.

\section{Method}
\paragraph{Design.} Two parts. \emph{Audit}: we describe what published records show for each gap. \emph{Build}: we construct a system on public sources and record what it takes and what it cannot do. Table~\ref{tab:hyp} states, for each hypothesis, what we measured and what we could not.
\paragraph{Terms.} The \emph{estate} is the set of datasets returned by a search of the national open-data portal for the Thai word for Chiang Mai. The \emph{catalogue} is the list of resources on the provincial portal. The \emph{board} is CNX's web screen. \emph{Baked} means a dataset was fetched and frozen on a stated date.

\begin{table*}[!t]
\centering\small
\caption{Four gaps: what we measured, what we could not, and what the audit shows (Section~\ref{sec:results}). The audit is descriptive; it does not test the hypotheses.}\label{tab:hyp}
\begin{tabularx}{\textwidth}{@{}p{2.2cm}XX@{}}
\toprule
\textbf{Gap} & \textbf{Measured / not measured} & \textbf{What the audit shows}\\\midrule
\hyp{H1} Coordination & \emph{Measured:} concentration of publishers. \emph{Not measured:} whether any datasets join across agencies; how agencies actually interact & @@estate_orgs@@ publishers, top two hold @@top2_pct@@\% (partly an artefact of the search); only @@spatial@@ datasets carry a location, so cross-agency joins on place are rare\\
\hyp{H2} Procurement & \emph{Measured:} whether contracts or purchases appear in the estate; service formats; licence; readability. \emph{Not measured:} what was bought, or on what terms & No procurement dataset found; @@api_n@@ datasets list an API format and none is a live feed; @@nolicence_pct@@\% state no licence; @@unreadable_pct@@\% of resources unreadable\\
\hyp{H3} Responsiveness & \emph{Measured:} age, spatial and time-indexed share of what the portal publishes. \emph{Not measured:} agencies' own operational systems & Median age @@median_age@@\,y; every disaster dataset is a register or an archive, none is live\\
\hyp{H4} End-to-end & \emph{Measured:} link-by-link presence in the estate for two chains; shelter and tower records. \emph{Not measured:} warning delivery or outcomes & No drainage, evacuation-route or clean-air-room data found; 0 of @@shelters@@ shelters carry a coordinate; @@tower_sites@@ warning-tower sites\\\bottomrule
\end{tabularx}
\end{table*}

\paragraph{Data.} All inputs are public or were collected by the system; none required an agreement.
\begin{itemize}
\item \kw{Open-data estate.} Every dataset returned by a search for ``Chiang Mai'' on the national open-data portal on 19 September 2026: @@estate_datasets@@ datasets with @@estate_resources@@ resources, each fetched and profiled; a resource is ``unreadable'' if the profiler could not parse it into a table (a PDF or image, a corrupt file, or a failed download; we did not separate the causes). A second catalogue of @@catalogue@@ resources (2 October) from the provincial portal was searched by title and tag. Absence statements below mean \emph{not found by title and tag search of these two sources}.
\item \kw{Disaster records.} The 11 datasets in the portal's disaster domain; the official temporary-shelter list (177 rows); the warning-tower list (12 rows).
\item \kw{System telemetry.} The system's own feed registry (32 entities, 4 November 2026); 2,576 camera frames received from three flood cameras (20 October to 4 November); 934 haze scores from one webcam, 917 paired with ground PM$_{2.5}$ (about four weeks); @@wlog_rows@@ level changes in the warning log (11 October to 3 November); a 271-commit build history (15 September to 3 November).
\item \kw{Burn seasons.} Monthly burned area, hotspot counts and PM$_{2.5}$ exceedance days for the 2024--25 and 2025--26 seasons, from the Hydro-Informatics Institute's burn-mapping data.
\end{itemize}
\paragraph{Shelters.} The official list has no coordinates, so we located each shelter with OpenStreetMap by name, accepting a point only if it lay inside the province outline and the stated district. Each point records its precision (building, subdistrict, district). We express sanitation as people per toilet and compare it with the humanitarian benchmark of at most 20 people per toilet from the Sphere standard; we confirmed this figure only in secondary sources and could not open the handbook, so it is a reference line, not a finding about compliance.
\paragraph{Reproducibility.} One script (\path{research/analysis/run_analysis.py}) regenerates every number and figure here from files in the repository. Counts, not significance tests, carry the argument: the estate is a census of one search, not a sample.

\section{The system}
\label{sec:system}
\begin{figure*}[!t]
\centering
\resizebox{\textwidth}{!}{\input{fig_chain.tikz}}
\caption{The chain from measurement to action. Boxes show the link; the grey line beneath names who publishes it, as far as we found, and whether a machine can read it. The red outline marks links we did not find in the estate.}\label{fig:chain}
\end{figure*}
We built \emph{CNX}, a public operations room for Chiang Mai (\url{https://cnx.nonarkara.org}), on five rules. CNX was not built from nothing: it began as a port of the second author\textquoteright s earlier provincial operations room for Lopburi (the first commit of this repository is titled a ``Lopburi-pattern port''), so the build times below measure an adaptation, not a first build.
\begin{enumerate}
\item \kw{Public sources only.} Read what agencies already publish. No memorandum with any agency. Some feeds need a free key or are subject to a provider\textquoteright s terms of use, which we did not negotiate and have not reviewed with counsel.
\item \kw{Say what you know and when.} Every number carries its source, its observation time and its failure mode. ``Unknown'' is never shown as ``calm''.
\item \kw{One verdict, thresholds from the source.} Rain bands follow the Thai Meteorological Department's 24-hour classes. A forecast may raise a level; it can never lower one that a measurement set.
\item \kw{Official first.} The meteorological service's own warnings lead the board. The board's own warnings leave as CAP messages marked \emph{restricted --- not an official public warning}.
\item \kw{Close the last link.} Every warning names the district's official shelters, with capacity.
\end{enumerate}
\noindent Figure~\ref{fig:chain} shows the chain the system tries to close. Its registry lists @@entities@@ entities from @@agencies@@ providers, including non-agency sources such as OpenStreetMap, news feeds and the board\textquoteright s own derived products (Figure~\ref{fig:registry}); @@relay_n@@ run through a relay on one machine, because their sources throttle or refuse the hosting platform's network or need work (such as image decoding) the platform cannot do.

\section{Results}
\label{sec:results}
\subsection{The estate: a record of the past, in files}
\begin{figure*}[!t]
\centering\includegraphics[width=\textwidth]{fig_estate}
\caption{The provincial open-data estate (n\,=\,@@estate_datasets@@ datasets, 19 September 2026). (a) Years since each dataset was last updated. (b) Publishers by number of datasets. (c) Resources the profiler could not read.}\label{fig:estate}
\end{figure*}
\textbf{H1 --- coordination.} The estate has @@estate_orgs@@ publishers, but two of them (the Provincial Office and the Provincial Treasury) hold @@top2_pct@@\% of datasets, and @@one_dataset_orgs@@ publishers contribute exactly one (Figure~\ref{fig:estate}b; Herfindahl index @@hhi@@). Because the search is for a province, provincial bodies dominate by construction, so concentration alone shows little. What matters for joining records is shared keys: only @@spatial@@ datasets (@@spatial_pct@@\%) carry a location, and we found no dataset about drainage, evacuation routes or clean-air rooms (Table~\ref{tab:links}). We did not test whether records from different agencies can in fact be joined.

\textbf{H2 --- procurement.} Across @@estate_datasets@@ datasets and @@catalogue@@ catalogue resources we found none about procurement, contracts or technology purchases. Two datasets list an API format (a provincial spending table and a provincial boundary layer), and none is a live feed. The estate is mostly files: @@csv@@ datasets offer CSV, @@xlsx@@ a spreadsheet and @@pdf@@ a PDF; @@unreadable_n@@ of @@estate_resources@@ resources (@@unreadable_pct@@\%) could not be parsed; @@nolicence_n@@ datasets (@@nolicence_pct@@\%) state no licence. This is an \emph{indirect} indicator. The portal does not publish what was bought, so it cannot show whether procurement favoured files over services, and a search for one province cannot show a national absence. It describes what a citizen or a neighbouring agency can reach, nothing more.

\textbf{H3 --- responsiveness.} The median dataset was @@median_age@@ years old when baked; @@within1y@@ of @@estate_datasets@@ had been updated within a year, and @@over3y@@ were more than three years stale. All @@disaster_n@@ datasets in the portal\textquoteright s disaster domain are registers or archives: injuries, deaths, damaged bridges, households affected, machinery and shelters (Table~\ref{tab:disaster}). The newest was updated on @@disaster_latest@@, and the flood response plan is a PDF. An open-data portal is an archive by design, so this describes the portal, not the agencies\textquoteright\ operational systems, which we could not see.

\begin{table*}[!t]
\centering\small
\caption{The disaster domain of the estate (titles translated). ``Time'' = has a time field; ``Place'' = has coordinates.}\label{tab:disaster}
\begin{tabularx}{\textwidth}{@{}lXllcc@{}}
\toprule
\textbf{Dataset} & \textbf{Publisher} & \textbf{Updated} & \textbf{Format} & \textbf{Time} & \textbf{Place}\\\midrule
@@disaster_rows@@\bottomrule
\end{tabularx}
\end{table*}

\begin{table}[!t]
\centering\small
\caption{Datasets in the estate that match each link of the two chains (title and tag search, Thai and English terms). ``Library''  is the @@estate_datasets@@-dataset estate; ``Catalogue''  is the @@catalogue@@ provincial-portal resources.}\label{tab:links}
\begin{tabular}{@{}lcc@{}}
\toprule
\textbf{Link} & \textbf{Library} & \textbf{Catalogue}\\\midrule
@@links_rows@@\bottomrule
\end{tabular}
\end{table}

\subsection{Two chains, link by link}
Table~\ref{tab:chains} walks the two chains the research question names; Figure~\ref{fig:chain} draws the chain.
\begin{table*}[!t]
\centering\small
\caption{Rain-to-drainage and haze-to-shelter, link by link. ``Estate'' is what the open-data estate holds; ``CNX'' is what the system does with public sources.}\label{tab:chains}
\begin{tabularx}{\textwidth}{@{}p{2.1cm}XXX@{}}
\toprule
\textbf{Link} & \textbf{Rain $\to$ drainage} & \textbf{Haze $\to$ shelter} & \textbf{CNX}\\\midrule
Sense & Rain gauges published by the national water-data portal; machine-readable, but the portal throttles the hosting platform, so a relay fetches them & Ground sensors (university network, Pollution Control Department); satellite fire detections (375\,m) & Both read. Rain: 15-min relay. Fires: province-only counts\\
Forecast & Open weather-model grids; we found no official gridded forecast we could read & Model PM$_{2.5}$ and 850\,hPa transport & 48-h field and smoke trajectories, labelled as model\\
Assets & \textbf{None found in either catalogue} & \textbf{None found} & \emph{Not closed.} Named as a gap\\
Decide & Meteorological service publishes CAP alerts for provinces \citep{tmd2026cap} & We found no haze alert feed & Official alerts first; board verdict second\\
Push & CAP is available; no public push from CNX (it lacks the authority) & Same & CAP export, \emph{restricted}\\
Shelter & Official list with capacity and utilities, no coordinates & Same list; no air-filtration data & Shelters per district named in each warning; @@bldg@@ located at the building\\
Verify & We found no published record of warnings scored against outcomes & Same & Warning log: @@wlog_rows@@ level changes since 11 Oct\\\bottomrule
\end{tabularx}
\end{table*}
\textbf{H4 --- end-to-end.} Of the seven links in each chain, the estate holds two in part: the shelter list (without coordinates) and the tower list (@@tower_sites@@ sites). We found no drainage network, evacuation routes or clean-air rooms. The meteorological service\textquoteright s alerts live outside the estate, in an open format. Where the system could join links from public sources, it did: gauges, fires, forecast and shelters sit in one verdict (Section~\ref{sec:system}). Where the link would be an asset register we could not find, it could not. Absence from a title-and-tag search of one province does not prove absence elsewhere --- a national drainage agency may hold such data --- so this is a finding about what a provincial user can reach.

\subsection{Shelters and warning towers}
\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_map}
\caption{Official shelters (by best available precision) and warning-tower sites in Chiang Mai.}\label{fig:map}
\end{figure}
The official list has @@shelters@@ rows in all @@sh_districts@@ districts (three repeat an earlier row, so @@distinct@@ are distinct), with a stated capacity of @@cap_total@@ people (median @@cap_median@@; the largest, @@cap_max@@, is one venue). \emph{None carries a coordinate.} After geocoding, @@bldg@@ are located at the building, @@tambon@@ at a subdistrict point and @@amphoe@@ at a district point (Figure~\ref{fig:shelters}b; Figure~\ref{fig:map}). A warning that says ``move to shelter'' cannot, today, say \emph{where} for @@approx_pct@@\% of the rows.

\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_shelters}
\caption{(a) People per toilet at shelters that report any toilets; the line is the reference value of 20. (b) Best location we can state for each shelter.}\label{fig:shelters}
\end{figure}
Sanitation is thinner than capacity. @@toilet_zero@@ shelters (@@toilet_zero_pct@@\%) report zero toilets; of the @@with_toilets@@ that report any, @@over20@@ (@@over20_pct@@\%) exceed 20 people per toilet (median @@ppt@@). If each shelter hosted only as many people as its toilets serve at that reference value, the stated @@cap_total@@ places would fall to @@cap_sphere@@ (@@cap_sphere_pct@@\%). This is a lower bound under a strict assumption: a school or temple reporting no toilet may rely on a neighbouring building.

The warning-tower list is an asset register kept by the National Disaster Warning Center for towers that alert the public to tsunami, flood and landslide. It has @@tower_rows@@ rows, which are the same @@tower_sites@@ sites listed in each of two yearly registers (2024 and 2025); we therefore count @@tower_sites@@ sites. Three of the six stand within a few kilometres of one another in the city. The nearest tower to any of the @@bldg@@ building-level shelters is a median @@tower_median@@\,km away; @@tower_within5@@ lie within 5\,km. The data do not say how far a tower\textquoteright s sound carries, and the list may be partial, so these distances are descriptive, not a coverage estimate.

\subsection{What the system took to build}
\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_build}
\caption{Cumulative commits across the build. Milestones: the first rain gauges, the 48-hour forecast, and the official warnings, shelters and CAP export.}\label{fig:build}
\end{figure}
The repository\textquoteright s first commit was on @@first_commit@@, and it began as a port (Section~\ref{sec:system}). By @@last_commit@@ it had @@commits@@ commits on @@build_days@@ active days within a seven-week calendar span. Measured rain was on the board on day @@day_rain@@, the 48-hour forecast on day @@day_forecast@@, and official warnings, geocoded shelters and the CAP export on day @@day_cap@@ (Figure~\ref{fig:build}). No agency was asked for anything; this is evidence of feasibility for one adapted system, not of the cost of a first build.

\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_registry}
\caption{The feed registry: cadence against the staleness limit each feed declares. Markers show how the feed reaches the system; colours show its kind.}\label{fig:registry}
\end{figure}
\textbf{Honest weaknesses.} Of @@entities@@ entities, only @@val_ground@@ is ground-truthed and @@val_cross@@ cross-checked; @@val_none@@ (@@val_none_pct@@\%) have no validation at all. The system shows data; it does not certify it. @@relay_n@@ entities depend on one relay machine (@@relay_pct@@\%), a single point of failure the board reports as ``unavailable'', never as ``calm''.

\subsection{Operating record}
On 4 November 2026, @@ontime@@ of @@slo_total@@ feeds with a declared limit were inside it; the one outside was a satellite product with no scene published for days, shown as unavailable. The three flood cameras returned a distinct new frame in @@cov_min@@--@@cov_max@@\% of 15-minute slots over 14.7 days (Figure~\ref{fig:cameras}); the longest silence was @@maxgap@@ hours. Frames arrived a median of 18--21 minutes after capture.
\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_cameras}
\caption{Frames received from three flood cameras, 20 October--4 November 2026. Gaps are silences in the source, not in the relay.}\label{fig:cameras}
\end{figure}
One webcam\textquoteright s haze scoring has been paired with @@haze_pairs@@ simultaneous ground PM$_{2.5}$ readings. The readings ranged @@haze_min@@--@@haze_max@@\,\textmu g/m$^3$ (median @@haze_med@@); @@haze_over15@@ exceeded 15 and none exceeded 37.5 (the WHO\textquoteright s 24-hour guideline and a 24-hour interim target; we compare single readings with a 24-hour value, so this is indicative). The pairs show the scorer stays quiet on clear days; they cannot show it detects a real haze event, because there has been none in the paired period.

The board's warning log recorded @@wlog_rows@@ level changes (@@wlog_pm@@ forecast-PM$_{2.5}$ district warnings and @@wlog_verdict@@ province-verdict changes), each with its reason, source and build. It is the beginning of the record that Table~\ref{tab:chains} found missing: warnings that can later be scored against outcomes.

\subsection{Burn seasons: the pattern the chain should catch}
\begin{figure}[!t]
\centering\includegraphics[width=\columnwidth]{fig_burn}
\caption{Monthly burned area (farm and forest) in two seasons.}\label{fig:burn}
\end{figure}
We hold two seasons, each covering November to April; hotspot counts are missing for November and December in both. In 2025--26, March and April carried @@mar_apr_69@@ of the @@over_69@@ PM$_{2.5}$-exceedance days; in 2024--25, @@mar_apr_68@@ of @@over_68@@. Burned area was lower in 2025--26 (@@burn_69@@ against @@burn_68@@ thousand rai) while hotspot detections were higher (@@hot_69@@ against @@hot_68@@, over different months). The two series measure different things, and the data owner warns that monthly area counts a field burned twice in both months, so they are not expected to reconcile. We show them to make one point: the season is predictable in month and place, which is what makes a standing chain worth building and a one-off project not.

\section{Discussion}
\paragraph{What bypassing means.} We bypassed three of the four gaps in a narrow, literal sense. Coordination: the system read each provider\textquoteright s public output and joined it itself, without waiting for an agreement. Procurement: it made no purchase, so it shows that a prototype can avoid the procurement gap, not that procurement is the cause; the system still runs on commercial hosting and free-tier feeds. Responsiveness: @@slo_total@@ of its @@entities@@ entities declare a staleness limit and show their age. The fourth gap, the end-to-end chain, was bridged only where public data existed; the system did not conjure a drainage network.

\paragraph{What cannot be bypassed.} Three things stayed out of reach, and they are the honest limit of this work. (1) \emph{Authority.} A public operations room can advise, and the board says plainly that it issues no evacuation order and no public alert. The national system for such orders is set by the Disaster Prevention and Mitigation Act \citep{thailand2007dpmact}; we claim no part of it. (2) \emph{Assets.} Nobody can route water to a drain that nobody has mapped. (3) \emph{Validation and staffing.} Most feeds are unvalidated against ground truth, and a screen with no named duty officer is a screen. The system's own manual still lists its owner, operator and duty officer as ``to be assigned''.

\paragraph{Why the four gaps stay open.} The data suggest a single mechanism rather than four. Each agency does its job and publishes the record of it --- a table, a PDF --- because that is what a project closes with. The estate is the sum of those closings. Records that end a project do not move a person; a service that never ends does. Procurement of the first kind produces the first kind of data. Coordination fails because there is nothing live to coordinate around. This is a hypothesis consistent with our data and with the literature on public IT \citep{goldfinch2007,heeks2006,pahlka2023}, not a result.

\paragraph{Policy implications.} Four cheap acts follow. Publish three records the chain needs: shelter coordinates, drainage geometry, and tower locations with audible range. Require, in each technology purchase, a documented machine interface and a licence \citep{edler2007,mergel2019}. Publish a freshness limit for every public feed, so that silence is visible. Carry every official warning in CAP \citep{oasis2010cap}, as the meteorological service\textquoteright s feed already does \citep{tmd2026cap}.

\paragraph{Threats to validity.}\label{sec:limits} (1) \emph{Design.} Single case, single province, one adapted system built by the second author. The audit is descriptive; H1--H3 are not tested, and H1\textquoteright s cross-agency joins and H2\textquoteright s procurement are not measured at all. A test would need interviews and procurement records. (2) \emph{Sampling.} The estate is the result of one search; absence means absence from that search, and provincial publishers dominate it by construction. (3) \emph{Evaluation.} The system is evaluated for feasibility and uptime only. We have no user study, no lead-time or accuracy test of its warnings, one webcam, and no haze event; 26 of 32 feeds have no validation. (4) \emph{Data.} Geocoded shelter points rest on OpenStreetMap coverage; the tower list may be partial; camera figures count distinct frames, so a frozen image counts as silence; the portal data may have changed since 19 September. (5) \emph{Interests.} The second author works for the agency that promotes the programme discussed and built the system; the first is affiliated with the case study\textquoteright s sponsor (Declarations). We report gaps in the second author\textquoteright s own sector for that reason. We show the gaps are present, measurable and partly bridgeable; we do not show that they \emph{cause} the stalled programmes.

\section{Conclusion}
The failure is not in the sensors. It is in the joints. In one province, with public data and no agreements, an adapted system could assemble a working chain from gauge to shelter in seven calendar weeks --- up to the points where an asset register is missing or an authority is required. Those two points are where policy, not software, would have to act: map the drain, publish the shelter\textquoteright s coordinates, and name who answers at two in the morning. Whether the four gaps explain Thailand\textquoteright s stalled programmes remains to be tested.

\section*{Declarations}
\small
\textbf{Competing interests.} P.T.\ is affiliated with RCAD, which sponsors the case study, and with the Faculty of Engineering, Chiang Mai University. N.A.\ is employed by the Digital Economy Promotion Agency (depa), which promotes the Smart City Thailand programme discussed here, and designed and built the CNX system. Whether either organisation reviewed this manuscript, and any funding for the work, are \textbf{to be stated by the authors before submission}. The views are the authors\textquoteright\ own and not those of any organisation.\\
\textbf{Data and code availability.} Data, analysis script and paper source: \path{research/} in the CNX repository at commit \texttt{@@commit@@}, and \url{https://cnx.nonarkara.org/cnx/research}. An archived copy with a DOI is \textbf{to be deposited} before submission. The portal data were baked on 19 September and 2 October 2026 and may have changed.\\
\textbf{AI assistance.} Analysis code, figures and drafting were assisted by Claude models (Anthropic; Opus 5.5 and Sonnet 5.5); the authors are responsible for the content. An independent AI review checked the numbers and claims, and its findings are reflected here. References were checked against Crossref, publisher or official pages; about a fifth were read in full and the rest were verified at record level only, so claims attached to them are limited to what their titles and scope state (see \path{references-verified.bib}).\\
\textbf{Author contributions.} \textbf{To be confirmed by the authors before submission.}\\
\textbf{Ethics and terms of use.} No personal data were collected. Citizen mentions are public posts held as title, link, time and named place, without author identity; camera video is not stored, and haze scoring keeps image statistics only. The Personal Data Protection Act applies to any expansion \citep{thailand2019pdpa}. The relay fetches public endpoints at a modest rate and does not bypass authentication; a formal terms-of-use review of each provider has not been done.

{\small\bibliographystyle{abbrvnat}\bibliography{refs}}
\end{document}
