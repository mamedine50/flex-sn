// AsyncStorage est un module natif : sous Jest il faut son doublure officielle.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
