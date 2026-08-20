export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bornes_prix: {
        Row: {
          facteur_detour: number
          max_xof: number
          min_xof: number
          prix_base_xof: number | null
          prix_km_xof: number | null
          service: Database["public"]["Enums"]["service_course"]
        }
        Insert: {
          facteur_detour?: number
          max_xof: number
          min_xof: number
          prix_base_xof?: number | null
          prix_km_xof?: number | null
          service: Database["public"]["Enums"]["service_course"]
        }
        Update: {
          facteur_detour?: number
          max_xof?: number
          min_xof?: number
          prix_base_xof?: number | null
          prix_km_xof?: number | null
          service?: Database["public"]["Enums"]["service_course"]
        }
        Relationships: []
      }
      communes: {
        Row: {
          alias: string[]
          code: string
          geo: unknown
          lat: number
          lon: number
          nom: string
          region: string
        }
        Insert: {
          alias?: string[]
          code: string
          geo?: unknown
          lat: number
          lon: number
          nom: string
          region: string
        }
        Update: {
          alias?: string[]
          code?: string
          geo?: unknown
          lat?: number
          lon?: number
          nom?: string
          region?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          auteur_id: string
          cible_id: string
          commentaire: string | null
          course_id: string
          cree_le: string
          note: number
        }
        Insert: {
          auteur_id: string
          cible_id: string
          commentaire?: string | null
          course_id: string
          cree_le?: string
          note: number
        }
        Update: {
          auteur_id?: string
          cible_id?: string
          commentaire?: string | null
          course_id?: string
          cree_le?: string
          note?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_cible_id_fkey"
            columns: ["cible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_cible_id_fkey"
            columns: ["cible_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      events_prix: {
        Row: {
          cree_le: string
          delai_premiere_offre_s: number | null
          demande_id: string
          distance_m: number
          maille_arrivee_lat: number
          maille_arrivee_lon: number
          maille_depart_lat: number
          maille_depart_lon: number
          nb_contre_offres: number
          nb_offres: number
          prix_convenu_xof: number | null
          prix_modifie: boolean
          prix_propose_xof: number
          recommandation_xof: number | null
          service: Database["public"]["Enums"]["service_course"]
        }
        Insert: {
          cree_le?: string
          delai_premiere_offre_s?: number | null
          demande_id: string
          distance_m: number
          maille_arrivee_lat: number
          maille_arrivee_lon: number
          maille_depart_lat: number
          maille_depart_lon: number
          nb_contre_offres?: number
          nb_offres?: number
          prix_convenu_xof?: number | null
          prix_modifie: boolean
          prix_propose_xof: number
          recommandation_xof?: number | null
          service: Database["public"]["Enums"]["service_course"]
        }
        Update: {
          cree_le?: string
          delai_premiere_offre_s?: number | null
          demande_id?: string
          distance_m?: number
          maille_arrivee_lat?: number
          maille_arrivee_lon?: number
          maille_depart_lat?: number
          maille_depart_lon?: number
          nb_contre_offres?: number
          nb_offres?: number
          prix_convenu_xof?: number | null
          prix_modifie?: boolean
          prix_propose_xof?: number
          recommandation_xof?: number | null
          service?: Database["public"]["Enums"]["service_course"]
        }
        Relationships: [
          {
            foreignKeyName: "events_prix_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: true
            referencedRelation: "demandes_ouvertes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_prix_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: true
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lieux: {
        Row: {
          alias: string[]
          categorie: Database["public"]["Enums"]["categorie_lieu"]
          code: string
          geo: unknown
          lat: number
          lon: number
          nom: string
        }
        Insert: {
          alias?: string[]
          categorie: Database["public"]["Enums"]["categorie_lieu"]
          code: string
          geo?: unknown
          lat: number
          lon: number
          nom: string
        }
        Update: {
          alias?: string[]
          categorie?: Database["public"]["Enums"]["categorie_lieu"]
          code?: string
          geo?: unknown
          lat?: number
          lon?: number
          nom?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          conducteur_id: string
          cree_le: string
          delai_arrivee_min: number
          demande_id: string
          expires_at: string
          id: string
          prix_xof: number
          statut: Database["public"]["Enums"]["statut_offre"]
          type: Database["public"]["Enums"]["type_offre"]
          vehicule_id: string
        }
        Insert: {
          conducteur_id: string
          cree_le?: string
          delai_arrivee_min: number
          demande_id: string
          expires_at: string
          id?: string
          prix_xof: number
          statut?: Database["public"]["Enums"]["statut_offre"]
          type: Database["public"]["Enums"]["type_offre"]
          vehicule_id: string
        }
        Update: {
          conducteur_id?: string
          cree_le?: string
          delai_arrivee_min?: number
          demande_id?: string
          expires_at?: string
          id?: string
          prix_xof?: number
          statut?: Database["public"]["Enums"]["statut_offre"]
          type?: Database["public"]["Enums"]["type_offre"]
          vehicule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_ouvertes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicules_publics"
            referencedColumns: ["id"]
          },
        ]
      }
      positions_conducteurs: {
        Row: {
          cap: number | null
          conducteur_id: string
          en_ligne: boolean
          geo: unknown
          lat: number
          lon: number
          maj_le: string
        }
        Insert: {
          cap?: number | null
          conducteur_id: string
          en_ligne?: boolean
          geo?: unknown
          lat: number
          lon: number
          maj_le?: string
        }
        Update: {
          cap?: number | null
          conducteur_id?: string
          en_ligne?: boolean
          geo?: unknown
          lat?: number
          lon?: number
          maj_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_conducteurs_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_conducteurs_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: true
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cree_le: string
          documents_valides_le: string | null
          id: string
          langue: string
          nb_notes: number
          nom_complet: string | null
          note_moyenne: number | null
          photo_url: string | null
          prenom: string
          role: Database["public"]["Enums"]["role_utilisateur"]
          telephone: string | null
        }
        Insert: {
          cree_le?: string
          documents_valides_le?: string | null
          id: string
          langue?: string
          nb_notes?: number
          nom_complet?: string | null
          note_moyenne?: number | null
          photo_url?: string | null
          prenom: string
          role?: Database["public"]["Enums"]["role_utilisateur"]
          telephone?: string | null
        }
        Update: {
          cree_le?: string
          documents_valides_le?: string | null
          id?: string
          langue?: string
          nb_notes?: number
          nom_complet?: string | null
          note_moyenne?: number | null
          photo_url?: string | null
          prenom?: string
          role?: Database["public"]["Enums"]["role_utilisateur"]
          telephone?: string | null
        }
        Relationships: []
      }
      ride_requests: {
        Row: {
          cree_le: string
          depart_geo: unknown
          depart_lat: number
          depart_libelle: string
          depart_lon: number
          destination_geo: unknown
          destination_lat: number
          destination_libelle: string
          destination_lon: number
          expires_at: string
          id: string
          passager_id: string
          prix_xof: number
          service: Database["public"]["Enums"]["service_course"]
          statut: Database["public"]["Enums"]["statut_demande"]
          verrouillee_le: string | null
          zone_depart_geo: unknown
        }
        Insert: {
          cree_le?: string
          depart_geo?: unknown
          depart_lat: number
          depart_libelle: string
          depart_lon: number
          destination_geo?: unknown
          destination_lat: number
          destination_libelle: string
          destination_lon: number
          expires_at: string
          id?: string
          passager_id: string
          prix_xof: number
          service: Database["public"]["Enums"]["service_course"]
          statut?: Database["public"]["Enums"]["statut_demande"]
          verrouillee_le?: string | null
          zone_depart_geo?: unknown
        }
        Update: {
          cree_le?: string
          depart_geo?: unknown
          depart_lat?: number
          depart_libelle?: string
          depart_lon?: number
          destination_geo?: unknown
          destination_lat?: number
          destination_libelle?: string
          destination_lon?: number
          expires_at?: string
          id?: string
          passager_id?: string
          prix_xof?: number
          service?: Database["public"]["Enums"]["service_course"]
          statut?: Database["public"]["Enums"]["statut_demande"]
          verrouillee_le?: string | null
          zone_depart_geo?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "ride_requests_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_requests_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          annulee_par: string | null
          conducteur_id: string
          demande_id: string
          id: string
          motif_annulation: string | null
          offre_id: string
          passager_id: string
          prix_convenu_xof: number
          statut: Database["public"]["Enums"]["statut_course"]
          terminee_le: string | null
          vehicule_id: string
          verrouillee_le: string
        }
        Insert: {
          annulee_par?: string | null
          conducteur_id: string
          demande_id: string
          id?: string
          motif_annulation?: string | null
          offre_id: string
          passager_id: string
          prix_convenu_xof: number
          statut?: Database["public"]["Enums"]["statut_course"]
          terminee_le?: string | null
          vehicule_id: string
          verrouillee_le?: string
        }
        Update: {
          annulee_par?: string | null
          conducteur_id?: string
          demande_id?: string
          id?: string
          motif_annulation?: string | null
          offre_id?: string
          passager_id?: string
          prix_convenu_xof?: number
          statut?: Database["public"]["Enums"]["statut_course"]
          terminee_le?: string | null
          vehicule_id?: string
          verrouillee_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_annulee_par_fkey"
            columns: ["annulee_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_annulee_par_fkey"
            columns: ["annulee_par"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: true
            referencedRelation: "demandes_ouvertes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: true
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: true
            referencedRelation: "offres_recues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicules_publics"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          actif: boolean
          conducteur_id: string
          couleur: string
          cree_le: string
          id: string
          modele: string
          plaque: string
        }
        Insert: {
          actif?: boolean
          conducteur_id: string
          couleur: string
          cree_le?: string
          id?: string
          modele: string
          plaque: string
        }
        Update: {
          actif?: boolean
          conducteur_id?: string
          couleur?: string
          cree_le?: string
          id?: string
          modele?: string
          plaque?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      demandes_ouvertes: {
        Row: {
          cree_le: string | null
          depart_commune: string | null
          destination_commune: string | null
          destination_libelle: string | null
          expires_at: string | null
          id: string | null
          passager_id: string | null
          passager_note: number | null
          passager_prenom: string | null
          prix_xof: number | null
          service: Database["public"]["Enums"]["service_course"] | null
          zone_depart_lat: number | null
          zone_depart_lon: number | null
          zone_destination_lat: number | null
          zone_destination_lon: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ride_requests_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_requests_passager_id_fkey"
            columns: ["passager_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations_visibles: {
        Row: {
          auteur_id: string | null
          cible_id: string | null
          commentaire: string | null
          course_id: string | null
          cree_le: string | null
          note: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_cible_id_fkey"
            columns: ["cible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_cible_id_fkey"
            columns: ["cible_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      offres_recues: {
        Row: {
          conducteur_id: string | null
          conducteur_nb_notes: number | null
          conducteur_note: number | null
          conducteur_photo: string | null
          conducteur_prenom: string | null
          cree_le: string | null
          delai_arrivee_min: number | null
          demande_id: string | null
          expires_at: string | null
          id: string | null
          prix_xof: number | null
          statut: Database["public"]["Enums"]["statut_offre"] | null
          type: Database["public"]["Enums"]["type_offre"] | null
          vehicule_couleur: string | null
          vehicule_modele: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_ouvertes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profils_publics: {
        Row: {
          id: string | null
          nb_notes: number | null
          note_moyenne: number | null
          photo_url: string | null
          prenom: string | null
          role: Database["public"]["Enums"]["role_utilisateur"] | null
        }
        Insert: {
          id?: string | null
          nb_notes?: number | null
          note_moyenne?: number | null
          photo_url?: string | null
          prenom?: string | null
          role?: Database["public"]["Enums"]["role_utilisateur"] | null
        }
        Update: {
          id?: string | null
          nb_notes?: number | null
          note_moyenne?: number | null
          photo_url?: string | null
          prenom?: string | null
          role?: Database["public"]["Enums"]["role_utilisateur"] | null
        }
        Relationships: []
      }
      stats_routes: {
        Row: {
          distance_moyenne_m: number | null
          maille_arrivee_lat: number | null
          maille_arrivee_lon: number | null
          maille_depart_lat: number | null
          maille_depart_lon: number | null
          nb_demandes: number | null
          nb_prix_libres_conclus: number | null
          p25_prix_convenu_xof: number | null
          taux_reponse: number | null
        }
        Relationships: []
      }
      vehicules_publics: {
        Row: {
          conducteur_id: string | null
          couleur: string | null
          id: string | null
          modele: string | null
        }
        Insert: {
          conducteur_id?: string | null
          couleur?: string | null
          id?: string | null
          modele?: string | null
        }
        Update: {
          conducteur_id?: string | null
          couleur?: string | null
          id?: string | null
          modele?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_conducteur_id_fkey"
            columns: ["conducteur_id"]
            isOneToOne: false
            referencedRelation: "profils_publics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_offer: {
        Args: { p_offre_id: string }
        Returns: {
          annulee_par: string | null
          conducteur_id: string
          demande_id: string
          id: string
          motif_annulation: string | null
          offre_id: string
          passager_id: string
          prix_convenu_xof: number
          statut: Database["public"]["Enums"]["statut_course"]
          terminee_le: string | null
          vehicule_id: string
          verrouillee_le: string
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      annuler_course: {
        Args: { p_course_id: string; p_motif?: string }
        Returns: {
          annulee_par: string | null
          conducteur_id: string
          demande_id: string
          id: string
          motif_annulation: string | null
          offre_id: string
          passager_id: string
          prix_convenu_xof: number
          statut: Database["public"]["Enums"]["statut_course"]
          terminee_le: string | null
          vehicule_id: string
          verrouillee_le: string
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arrondir_zone: { Args: { coord: number }; Returns: number }
      avancer_course: {
        Args: {
          p_course_id: string
          p_statut: Database["public"]["Enums"]["statut_course"]
        }
        Returns: {
          annulee_par: string | null
          conducteur_id: string
          demande_id: string
          id: string
          motif_annulation: string | null
          offre_id: string
          passager_id: string
          prix_convenu_xof: number
          statut: Database["public"]["Enums"]["statut_course"]
          terminee_le: string | null
          vehicule_id: string
          verrouillee_le: string
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commune_la_plus_proche: {
        Args: { p_lat: number; p_lon: number; p_rayon_max_m?: number }
        Returns: string
      }
      course_active: {
        Args: { p_statut: Database["public"]["Enums"]["statut_course"] }
        Returns: boolean
      }
      course_en_deplacement: {
        Args: { p_statut: Database["public"]["Enums"]["statut_course"] }
        Returns: boolean
      }
      create_ride_request: {
        Args: {
          p_depart_lat: number
          p_depart_libelle: string
          p_depart_lon: number
          p_destination_lat: number
          p_destination_libelle: string
          p_destination_lon: number
          p_prix_xof: number
          p_recommandation_xof?: number
          p_service: Database["public"]["Enums"]["service_course"]
        }
        Returns: {
          cree_le: string
          depart_geo: unknown
          depart_lat: number
          depart_libelle: string
          depart_lon: number
          destination_geo: unknown
          destination_lat: number
          destination_libelle: string
          destination_lon: number
          expires_at: string
          id: string
          passager_id: string
          prix_xof: number
          service: Database["public"]["Enums"]["service_course"]
          statut: Database["public"]["Enums"]["statut_demande"]
          verrouillee_le: string | null
          zone_depart_geo: unknown
        }
        SetofOptions: {
          from: "*"
          to: "ride_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delai_double_aveugle: { Args: never; Returns: string }
      demandes_proches: {
        Args: { p_rayon_m?: number }
        Returns: {
          cree_le: string | null
          depart_commune: string | null
          destination_commune: string | null
          destination_libelle: string | null
          expires_at: string | null
          id: string | null
          passager_id: string | null
          passager_note: number | null
          passager_prenom: string | null
          prix_xof: number | null
          service: Database["public"]["Enums"]["service_course"] | null
          zone_depart_lat: number | null
          zone_depart_lon: number | null
          zone_destination_lat: number | null
          zone_destination_lon: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "demandes_ouvertes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      duree_demande: {
        Args: { p_service: Database["public"]["Enums"]["service_course"] }
        Returns: string
      }
      duree_offre: {
        Args: { p_service: Database["public"]["Enums"]["service_course"] }
        Returns: string
      }
      est_conducteur: { Args: { p_profil: string }; Returns: boolean }
      expire_stale: {
        Args: never
        Returns: {
          demandes_expirees: number
          offres_expirees: number
        }[]
      }
      maj_position: {
        Args: {
          p_cap?: number
          p_en_ligne?: boolean
          p_lat: number
          p_lon: number
        }
        Returns: {
          cap: number | null
          conducteur_id: string
          en_ligne: boolean
          geo: unknown
          lat: number
          lon: number
          maj_le: string
        }
        SetofOptions: {
          from: "*"
          to: "positions_conducteurs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      maj_profil: {
        Args: { p_langue?: string; p_nom_complet?: string; p_prenom?: string }
        Returns: {
          cree_le: string
          documents_valides_le: string | null
          id: string
          langue: string
          nb_notes: number
          nom_complet: string | null
          note_moyenne: number | null
          photo_url: string | null
          prenom: string
          role: Database["public"]["Enums"]["role_utilisateur"]
          telephone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      noter_course: {
        Args: { p_commentaire?: string; p_course_id: string; p_note: number }
        Returns: {
          auteur_id: string
          cible_id: string
          commentaire: string | null
          course_id: string
          cree_le: string
          note: number
        }
        SetofOptions: {
          from: "*"
          to: "evaluations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prix_suggere: {
        Args: {
          p_depart_lat: number
          p_depart_lon: number
          p_destination_lat: number
          p_destination_lon: number
          p_service: Database["public"]["Enums"]["service_course"]
        }
        Returns: number
      }
      publier_evaluations: { Args: never; Returns: number }
      recalculer_notes: { Args: { p_course_id: string }; Returns: undefined }
      refuse_offer: {
        Args: { p_offre_id: string }
        Returns: {
          conducteur_id: string
          cree_le: string
          delai_arrivee_min: number
          demande_id: string
          expires_at: string
          id: string
          prix_xof: number
          statut: Database["public"]["Enums"]["statut_offre"]
          type: Database["public"]["Enums"]["type_offre"]
          vehicule_id: string
        }
        SetofOptions: {
          from: "*"
          to: "offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_offer: {
        Args: {
          p_delai_arrivee_min: number
          p_demande_id: string
          p_prix_xof: number
          p_type: Database["public"]["Enums"]["type_offre"]
        }
        Returns: {
          conducteur_id: string
          cree_le: string
          delai_arrivee_min: number
          demande_id: string
          expires_at: string
          id: string
          prix_xof: number
          statut: Database["public"]["Enums"]["statut_offre"]
          type: Database["public"]["Enums"]["type_offre"]
          vehicule_id: string
        }
        SetofOptions: {
          from: "*"
          to: "offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      taille_cellule_deg: { Args: never; Returns: number }
    }
    Enums: {
      categorie_lieu:
        | "quartier"
        | "arret"
        | "aeroport"
        | "gare"
        | "stade"
        | "hotel"
        | "hopital"
        | "universite"
        | "marche"
        | "centre_commercial"
        | "monument"
        | "lieu_culte"
      role_utilisateur: "passager" | "conducteur"
      service_course: "urbain" | "interurbain"
      statut_course:
        | "verrouillee"
        | "en_route"
        | "arrive"
        | "commencee"
        | "en_cours"
        | "terminee"
        | "annulee"
      statut_demande: "ouverte" | "verrouillee" | "expiree" | "annulee"
      statut_offre:
        | "en_attente"
        | "acceptee"
        | "refusee"
        | "expiree"
        | "caduque"
      type_offre: "acceptation" | "contre_offre"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      categorie_lieu: [
        "quartier",
        "arret",
        "aeroport",
        "gare",
        "stade",
        "hotel",
        "hopital",
        "universite",
        "marche",
        "centre_commercial",
        "monument",
        "lieu_culte",
      ],
      role_utilisateur: ["passager", "conducteur"],
      service_course: ["urbain", "interurbain"],
      statut_course: [
        "verrouillee",
        "en_route",
        "arrive",
        "commencee",
        "en_cours",
        "terminee",
        "annulee",
      ],
      statut_demande: ["ouverte", "verrouillee", "expiree", "annulee"],
      statut_offre: ["en_attente", "acceptee", "refusee", "expiree", "caduque"],
      type_offre: ["acceptation", "contre_offre"],
    },
  },
} as const

