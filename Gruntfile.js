'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({

    // Task configuration.
    jshint: {
      options: {
        jshintrc: true
      },
      gruntfile: {
        src: ['Gruntfile.js']
      },
      src: {
        src: ['index.js', 'src/**/*.js', 'lib/**/*.js']
      },
      test: {
        src: ['test/**/*.js']
      }
    }

  });


  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');

  // Default task.
  grunt.registerTask('default', ['jshint']);

  // Travis CI task.
  grunt.registerTask('travis', ['jshint']);

};
