-- Schema BTT-LUX
-- ALIGNE SUR LA BASE DE PRODUCTION REELLE (genere via scripts/dumpRealSchema.js)
-- + tables paiements / professionnels / notifications ajoutees en 2026.
-- Idempotent : CREATE TABLE IF NOT EXISTS.
-- Genere depuis la base REELLE (node scripts/dumpRealSchema.js)
-- Source de verite : structure de production.

CREATE TABLE IF NOT EXISTS accessoires (
    id INTEGER NOT NULL,
    nom VARCHAR(255) NOT NULL,
    nom_en VARCHAR(255),
    prix_ttc DOUBLE PRECISION NOT NULL,
    statut_stock VARCHAR(50) DEFAULT 'En stock'::character varying,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT accessoires_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS calculs_historique (
    id INTEGER NOT NULL,
    utilisateur_id UUID,
    surface DOUBLE PRECISION,
    type_batiment VARCHAR(50),
    etage INTEGER,
    epaisseur_panneau VARCHAR(50),
    nb_panneaux INTEGER,
    cout_total DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT calculs_historique_pkey PRIMARY KEY (id),
    CONSTRAINT calculs_historique_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS chantiers (
    id INTEGER NOT NULL,
    devis_id INTEGER,
    etape VARCHAR(50) DEFAULT 'Devis re├ºu'::character varying,
    technicien_assigne VARCHAR(255),
    historique JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT now(),
    mission_id INTEGER,
    CONSTRAINT chantiers_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id),
    CONSTRAINT chantiers_devis_id_key UNIQUE (devis_id),
    CONSTRAINT chantiers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS devis (
    id INTEGER NOT NULL,
    utilisateur_id UUID,
    ville VARCHAR(100),
    adresse TEXT,
    etage INTEGER,
    surface DOUBLE PRECISION,
    nb_panneaux INTEGER,
    prix_unitaire DOUBLE PRECISION,
    cout_estime_brut DOUBLE PRECISION,
    remise_pourcentage DOUBLE PRECISION DEFAULT 0,
    frais_transport DOUBLE PRECISION DEFAULT 0,
    frais_divers DOUBLE PRECISION DEFAULT 0,
    total_final DOUBLE PRECISION,
    statut VARCHAR(20) DEFAULT 'envoye'::character varying,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT devis_pkey PRIMARY KEY (id),
    CONSTRAINT devis_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS mesures_terrain (
    id INTEGER NOT NULL,
    mission_id INTEGER,
    longueur_murs DOUBLE PRECISION,
    hauteur_sous_plafond DOUBLE PRECISION,
    surface_ouverte DOUBLE PRECISION,
    perimetre DOUBLE PRECISION,
    surface_reelle DOUBLE PRECISION,
    nb_panneaux_reel INTEGER,
    photo_urls TEXT[],
    croquis_url TEXT,
    valide_par_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT mesures_terrain_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions_technicien(id),
    CONSTRAINT mesures_terrain_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS missions_technicien (
    id INTEGER NOT NULL,
    devis_id INTEGER,
    technicien_id UUID,
    statut VARCHAR(20) DEFAULT 'assignee'::character varying,
    date_visite DATE,
    notes_technicien TEXT,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT missions_technicien_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id),
    CONSTRAINT missions_technicien_devis_id_key UNIQUE (devis_id),
    CONSTRAINT missions_technicien_pkey PRIMARY KEY (id),
    CONSTRAINT missions_technicien_technicien_id_fkey FOREIGN KEY (technicien_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS otp_secrets (
    utilisateur_id UUID NOT NULL,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT otp_secrets_pkey PRIMARY KEY (utilisateur_id),
    CONSTRAINT otp_secrets_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
);

CREATE TABLE IF NOT EXISTS produits (
    id INTEGER NOT NULL,
    nom VARCHAR(255) NOT NULL,
    epaisseur VARCHAR(50),
    categorie VARCHAR(100),
    prix_ttc DOUBLE PRECISION NOT NULL,
    poids_unite DOUBLE PRECISION,
    qte_conteneur INTEGER,
    statut_stock VARCHAR(50),
    application TEXT,
    CONSTRAINT produits_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS utilisateurs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    nom VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telephone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'client'::character varying,
    ville VARCHAR(100),
    mot_de_passe_hash TEXT NOT NULL,
    telephone_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT utilisateurs_email_key UNIQUE (email),
    CONSTRAINT utilisateurs_pkey PRIMARY KEY (id),
    CONSTRAINT utilisateurs_telephone_key UNIQUE (telephone)
);

-- Index


-- ============================================================
-- Tables manquantes en production (ajout 2026)
-- Style aligne sur la base reelle : ids entiers + FK utilisateurs en UUID
-- ============================================================

CREATE TABLE IF NOT EXISTS paiements (
    id SERIAL PRIMARY KEY,
    utilisateur_id UUID REFERENCES utilisateurs(id),
    devis_id INTEGER REFERENCES devis(id),
    methode VARCHAR(50),
    montant DOUBLE PRECISION NOT NULL,
    reference VARCHAR(100) UNIQUE NOT NULL,
    transaction_id VARCHAR(100),
    statut VARCHAR(50) DEFAULT 'en_attente',
    payment_data JSONB,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS professionnels (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    niveau_certification VARCHAR(100),
    note DOUBLE PRECISION DEFAULT 0,
    nb_chantiers INTEGER DEFAULT 0,
    disponible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT professionnels_identite_key UNIQUE (nom, ville, telephone, role)
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    corps TEXT NOT NULL,
    lu BOOLEAN DEFAULT FALSE,
    type VARCHAR(50) DEFAULT 'info',
    date_envoi TIMESTAMP DEFAULT now()
);

-- Index applicatifs
CREATE INDEX IF NOT EXISTS idx_paiements_utilisateur ON paiements(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_paiements_devis ON paiements(devis_id);
CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_professionnels_role ON professionnels(role);
CREATE INDEX IF NOT EXISTS idx_professionnels_ville ON professionnels(ville);
